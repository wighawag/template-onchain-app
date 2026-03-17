import type {Clock} from '$lib/context/types';
import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import {serializer} from '$lib/core/utils/data/serializer';
import type {
	TransactionIntent,
	TransactionIntentEvent,
	TransactionObserver,
} from '@etherkit/tx-observer';
import type {
	KnownTrackedTransaction,
	PopulatedMetadata,
	TrackedTransaction,
	TrackedWalletClientType,
} from '@etherkit/viem-tx-tracker';
import {
	createLocalStorageAdapter,
	createMultiAccountStore,
	createSyncableStore,
	defineSchema,
	map,
} from 'synqable';

export type TransactionMetadata = PopulatedMetadata;

export type OnchainOperationMetadata = TransactionMetadata & {
	tx: Omit<TrackedTransaction<PopulatedMetadata>, 'metadata'>;
};

export type OnchainOperation = {
	metadata: OnchainOperationMetadata;
	transactionIntent: TransactionIntent;
};

const schema = defineSchema({
	operations: map<OnchainOperation>(),
});

export type Schema = typeof schema;

export function createAccountData(params: {
	accountStore: AccountStore;
	deployments: TypedDeployments;
	clock: Clock;
}) {
	const {accountStore, deployments, clock} = params;
	return createMultiAccountStore({
		accountStore,
		schema,
		factory: (account) =>
			createSyncableStore({
				schema,
				account,
				defaultData: () => {
					return {operations: {}};
				},
				clock: () => clock.now(),
				storage: {
					adapterFactory: (_privateKey) =>
						createLocalStorageAdapter(serializer),
					key: `__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${account}`,
				},
			}),
	});
}

export type MultiAccountDataStore = ReturnType<typeof createAccountData>;

export function createTrackedWalletConnector(params: {
	clock: Clock;
	walletClient: TrackedWalletClientType<TransactionMetadata, true>;
	accountData: MultiAccountDataStore;
}) {
	const {accountData, clock, walletClient} = params;
	let lastId: number = 0;
	function generateId() {
		let id = clock.now();
		if (id == lastId) {
			id = lastId + 1;
		}
		lastId = id;
		return id.toString();
	}

	function withCurrentAccount<T>(
		eventName: string,
		handler: (
			currentAccount: NonNullable<ReturnType<typeof accountData.get>>,
		) => T,
	): T | undefined {
		const currentAccount = accountData.get();
		if (!currentAccount) {
			console.error(`${eventName} but accountData is not ready`);
			return;
		}
		return handler(currentAccount);
	}

	function findOperationByTxHash(
		operations: Record<
			string,
			{transactionIntent: {transactions: readonly {hash: string}[]}}
		>,
		txHash: string,
	): {operationID: string; txIndex: number} | undefined {
		for (const operationID of Object.keys(operations)) {
			const txIndex = operations[
				operationID
			].transactionIntent.transactions.findIndex((tx) => tx.hash === txHash);
			if (txIndex >= 0) {
				return {operationID, txIndex};
			}
		}
		return undefined;
	}

	function onTransactionBroadcasted(
		transaction: TrackedTransaction<TransactionMetadata>,
	) {
		withCurrentAccount('broadcasted transaction', (currentAccount) => {
			const id = generateId();
			currentAccount.addItem(
				'operations',
				id,
				{
					transactionIntent: {
						transactions: [
							{
								broadcastTimestampMs: transaction.broadcastTimestampMs,
								from: transaction.from,
								hash: transaction.hash,
								nonce: transaction.nonce,
							},
						],
					},
					metadata: {...transaction.metadata, tx: transaction},
				},
				// TODO define a correct value, make it configurable
				{deleteAt: clock.now() + 7 * 24 * 60 * 60 * 1000},
			);
		});
	}

	function onTransactionFetched(
		transaction: KnownTrackedTransaction<TransactionMetadata>,
	) {
		withCurrentAccount('fetched transaction', (currentAccount) => {
			const account = currentAccount.get();
			if (account.status !== 'ready') return;

			const txFound = findOperationByTxHash(
				account.data.operations,
				transaction.hash,
			);
			if (!txFound) {
				console.error(`no operations found with tx: ${transaction.hash}`);
				return;
			}

			currentAccount.patchItem(
				'operations',
				txFound.operationID,
				(operation) => ({
					...operation,
					transactionIntent: {
						...operation.transactionIntent,
						transactions: operation.transactionIntent.transactions.map(
							(tx, i) =>
								i === txFound.txIndex ? {...tx, nonce: transaction.nonce} : tx,
						),
					},
					metadata: {...transaction.metadata, tx: transaction},
				}),
			);
		});
	}

	let unsubscribeFromBroadcastedTransaction: (() => void) | undefined;
	let unsubscribeFromFetchedTransaction: (() => void) | undefined;
	function connect() {
		disconnect();
		unsubscribeFromBroadcastedTransaction = walletClient.on(
			'transaction:broadcasted',
			onTransactionBroadcasted,
		);
		// if needed we can also update on getting the full tx data
		unsubscribeFromFetchedTransaction = walletClient.on(
			'transaction:fetched',
			onTransactionFetched,
		);
	}

	function disconnect() {
		unsubscribeFromBroadcastedTransaction?.();
		unsubscribeFromFetchedTransaction?.();
	}

	return {
		connect,
		disconnect,
	};
}

/**
 * Reverse of DeepReadonly. Removes 'readonly' from all nested properties.
 */
export type DeepWritable<T> =
	T extends ReadonlyMap<infer K, infer V>
		? Map<DeepWritable<K>, DeepWritable<V>>
		: T extends ReadonlySet<infer U>
			? Set<DeepWritable<U>>
			: T extends ReadonlyArray<infer U>
				? Array<DeepWritable<U>>
				: T extends object
					? {-readonly [K in keyof T]: DeepWritable<T[K]>}
					: T;

function clone<T>(v: T): DeepWritable<T> {
	return structuredClone(v) as DeepWritable<T>;
}

export function createTransactionObserverConnector(params: {
	txObserver: TransactionObserver;
	accountData: MultiAccountDataStore;
}) {
	const {accountData, txObserver} = params;

	function onTransactionUpdated(event: TransactionIntentEvent) {
		const operationID = event.id;
		const currentAccount = accountData.get();
		if (currentAccount) {
			// tx-observer is built in a way that we can be sure that the tx belong to the current account
			currentAccount.updateItem('operations', operationID, {
				transactionIntent: event.intent,
			});
		}
	}

	function notifyObserverOfTransactions() {
		let currentAccountSubscription:
			| {
					account: `0x${string}`;
					unsubscribe: () => void;
			  }
			| undefined;
		const unsubscribeFromAccountData = accountData.subscribe(
			(currentAccountData) => {
				if (currentAccountData) {
					if (
						!currentAccountSubscription ||
						currentAccountSubscription.account != currentAccountData.account
					) {
						currentAccountSubscription?.unsubscribe();
						txObserver.clear();
						const unsubFromAdded = currentAccountData.on(
							'operations:added',
							({key, item}) => {
								txObserver.add(key, item.transactionIntent);
							},
						);
						const unsubFromRemoved = currentAccountData.on(
							'operations:removed',
							({key}) => {
								txObserver.remove(key);
							},
						);
						const unsubFromState = currentAccountData.state$.subscribe(
							(state) => {
								if (state.status === 'ready') {
									const currentState = currentAccountData.get();
									if (currentState && currentState.status === 'ready') {
										const operations = currentState.data.operations;
										const intents: {[id: string]: TransactionIntent} = {};
										for (const id in operations) {
											intents[id] = clone(operations[id].transactionIntent);
										}
										txObserver.addMultiple(intents);
									}
								}
							},
						);
						currentAccountSubscription = {
							account: currentAccountData.account,
							unsubscribe: () => {
								unsubFromAdded();
								unsubFromRemoved();
								unsubFromState();
							},
						};
					}
				} else {
					currentAccountSubscription?.unsubscribe();
					currentAccountSubscription = undefined;
					txObserver.clear();
				}
			},
		);
		return unsubscribeFromAccountData;
	}

	let stopListeningForTransactions: (() => void) | undefined;
	let unsubscribeFromTransactionUpdates: (() => void) | undefined;
	function connect() {
		disconnect();
		unsubscribeFromTransactionUpdates = txObserver.on(
			'intent:status',
			onTransactionUpdated,
		);
		stopListeningForTransactions = notifyObserverOfTransactions();
	}

	function disconnect() {
		stopListeningForTransactions?.();
		unsubscribeFromTransactionUpdates?.();
	}

	return {
		connect,
		disconnect,
	};
}
