import type {Context} from './types.js';

import {establishRemoteConnection} from '$lib/core/connection';
import {createBalanceStore} from '$lib/core/connection/balance.js';
import {createGasFeeStore} from '$lib/core/connection/gasFee';
import {createTrackedWalletClient} from '@etherkit/viem-tx-tracker';
import {
	createTransactionObserver,
	type TransactionIntent,
} from '@etherkit/tx-observer';
import {createAccountData} from '$lib/account/AccountData.js';
import {createOnchainState} from '$lib/onchain/state.js';

export async function createContext(): Promise<{
	context: Context;
	start: () => () => void;
}> {
	const window = globalThis as any;

	// ----------------------------------------------------------------------------
	// CONNECTION
	// ----------------------------------------------------------------------------

	const {
		connection,
		walletClient: rawWalletClient,
		publicClient,
		account,
		deployments,
	} = await establishRemoteConnection();

	window.connection = connection;
	window.publicClient = publicClient;
	window.deployments = deployments;

	const clock = Date;

	// ----------------------------------------------------------------------------
	// TRACKED WALLET CLIENT
	// ----------------------------------------------------------------------------

	// Wrap the raw wallet client with tracking capabilities
	// This is exposed as `walletClient` for drop-in compatibility
	// Use `walletClient.walletClient` to access the underlying viem WalletClient if needed
	const walletClient = createTrackedWalletClient({
		populateMetadata: true,
	}).using(rawWalletClient, publicClient);
	window.walletClient = walletClient;

	// ----------------------------------------------------------------------------

	const onchainState = createOnchainState({
		publicClient,
		deployments: deployments.current,
	});

	const accountData = createAccountData({
		accountStore: account,
		deployments: deployments.current,
		clock,
	});

	const txOberserver = createTransactionObserver({
		finality: 12, //TODO
		provider: connection.provider,
	});

	// ----------------------------------------------------------------
	// Capture tx from Tracked Wallet Client
	// ----------------------------------------------------------------
	let lastId: number = 0;
	function generateId() {
		let id = clock.now();
		if (id == lastId) {
			id = lastId + 1;
		}
		lastId = id;
		return id.toString();
	}
	walletClient.onTransactionBroadcasted((transaction) => {
		const currentAccount = accountData.get();
		if (!currentAccount) {
			console.error(`broadcasted transaction but accountData is not ready`);
			return;
		}
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
				metadata: transaction.metadata,
			},
			{deleteAt: clock.now() + 7 * 24 * 60 * 60 * 1000},
		);
	});
	// ----------------------------------------------------------------

	// ----------------------------------------------------------------
	// Each time the tx observer compute a new state for a tx
	// make the account aware of it
	// ----------------------------------------------------------------
	txOberserver.on('intent:status', (event) => {
		const operationID = event.id;
		const currentAccount = accountData.get();
		if (currentAccount) {
			// tx-observer is built in a way that we can be sure that the tx belong to the current account
			currentAccount.updateItem('operations', operationID, {
				transactionIntent: event.intent,
			});
		}
	});

	// ----------------------------------------------------------------------------

	// ----------------------------------------------------------------------------
	// BALANCE AND COSTS
	// ----------------------------------------------------------------------------

	const balance = createBalanceStore({publicClient, account});
	window.balance = balance;

	// ----------------------------------------------------------------------------

	// TODO use deployment store ?
	const gasFee = createGasFeeStore({
		publicClient: publicClient,
		deployments: deployments.current,
	});
	window.gasFee = gasFee;
	// ----------------------------------------------------------------------------

	return {
		context: {
			gasFee,
			balance,
			connection,
			walletClient,
			publicClient,
			account,
			deployments,
			accountData,
			onchainState,
			clock,
		},
		start: () => {
			// we trigger it so it is always availabe
			const unsubscribeFromBalance = balance.subscribe(() => {});
			// we trigger it so it is always availabe
			const unsubscribeFromGasFee = gasFee.subscribe(() => {});

			const txObserverInterval = setInterval(() => {
				txOberserver.process();
			}, 2 * 1000); // TODO delay or use onNewBlock hook

			// ----------------------------------------------------------------
			// Subscribing to Tx from Account Data
			//  and submitting them to the tx observer
			// ----------------------------------------------------------------
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
							txOberserver.clear();
							const unsubFromAdded = currentAccountData.on(
								'operations:added',
								({key, item}) => {
									txOberserver.add(key, item.transactionIntent);
								},
							);
							const unsubFromRemoved = currentAccountData.on(
								'operations:removed',
								({key}) => {
									txOberserver.remove(key);
								},
							);
							const unsubFromState = currentAccountData.subscribe((state) => {
								console.log(`STATE`, state);
								if (state.status == 'ready') {
									const data = state.data;
									const operations = data.operations;
									const intents: {[id: string]: TransactionIntent} = {};
									for (const id in operations) {
										intents[id] = operations[id].transactionIntent;
									}
									txOberserver.addMultiple(intents);
								} else {
								}
							});
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
						txOberserver.clear();
					}
				},
			);
			// ----------------------------------------------------------------

			return () => {
				clearInterval(txObserverInterval);
				unsubscribeFromBalance();
				unsubscribeFromGasFee();
				unsubscribeFromAccountData();
			};
		},
	};
}
