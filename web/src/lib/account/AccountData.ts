import type {Clock} from '$lib/context/types';
import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import {serializer} from '$lib/core/utils/data/serializer';
import type {
	TransactionIntent,
	TransactionIntentEvent,
} from '@etherkit/tx-observer';
import type {
	KnownTrackedTransaction,
	PopulatedMetadata,
	TrackedTransaction,
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

	let lastId: number = 0;
	function generateId() {
		let id = clock.now();
		if (id == lastId) {
			id = lastId + 1;
		}
		lastId = id;
		return id.toString();
	}

	const store = createMultiAccountStore({
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

	function findOperationByTxHash(txHash: string) {
		const accountData = store.get()?.get();
		if (accountData && accountData.status === 'ready') {
			const operations = accountData.data.operations;
			for (const operationID of Object.keys(operations)) {
				const txIndex = operations[
					operationID
				].transactionIntent.transactions.findIndex((tx) => tx.hash === txHash);
				if (txIndex >= 0) {
					return {operationID, txIndex};
				}
			}
		} else {
			throw new Error(`accountData not ready`);
		}
	}

	function addOperationFromTrackedTransaction(
		transaction: TrackedTransaction<TransactionMetadata>,
	) {
		const accountData = store.get();
		if (accountData) {
			const id = generateId();
			accountData.addItem(
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
		} else {
			throw new Error(`accountData not ready`);
		}
	}

	function updateOperationFromFetchedTransaction(
		transaction: KnownTrackedTransaction<TransactionMetadata>,
	) {
		const accountData = store.get();
		if (accountData) {
			const txFound = findOperationByTxHash(transaction.hash);
			if (!txFound) {
				console.error(`no operations found with tx: ${transaction.hash}`);
				return;
			}

			accountData.patchItem('operations', txFound.operationID, (operation) => ({
				...operation,
				transactionIntent: {
					...operation.transactionIntent,
					transactions: operation.transactionIntent.transactions.map((tx, i) =>
						i === txFound.txIndex ? {...tx, nonce: transaction.nonce} : tx,
					),
				},
				metadata: {...transaction.metadata, tx: transaction},
			}));
		} else {
			throw new Error(`accountData not ready`);
		}
	}

	function updateOperationFromTransactionStateUpdated(
		event: TransactionIntentEvent,
	) {
		const operationID = event.id;
		const accountData = store.get();
		if (accountData) {
			// tx-observer is built in a way that we can be sure that the tx belong to the current account
			accountData.updateItem('operations', operationID, {
				transactionIntent: event.intent,
			});
		}
	}

	return {
		...store,
		addOperationFromTrackedTransaction,
		updateOperationFromFetchedTransaction,
		updateOperationFromTransactionStateUpdated,
	};
}

export type MultiAccountDataStore = ReturnType<typeof createAccountData>;
