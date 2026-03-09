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
		signer,
		connection,
		walletClient: rawWalletClient,
		publicClient,
		account,
		deployments,
	} = await establishRemoteConnection();

	window.connection = connection;
	window.publicClient = publicClient;
	window.deployments = deployments;

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
		account,
		deployments: deployments.current,
	});

	const txOberserver = createTransactionObserver({
		finality: 12, //TODO
		provider: connection.provider,
	});

	accountData.on('state', (state) => {
		if (state.status == 'idle' || state.status == 'loading') {
			txOberserver.clear();
		} else {
			const operations = state.data.operations;
			const intents: {[id: string]: TransactionIntent} = {};
			for (const id in operations) {
				intents[id] = operations[id].transactionIntent;
			}
			txOberserver.addMultiple(intents);
		}
	});
	accountData.on('operations:added', ({id, operation}) => {
		txOberserver.add(id.toString(), operation.transactionIntent);
	});
	accountData.on('operations:removed', ({id}) => {
		txOberserver.remove(id.toString());
	});

	walletClient.onTransactionBroadcasted((transaction) => {
		// TODO handle account
		if (accountData.state.status !== 'ready') {
			console.error(`broadcasted transaction but accountData is not ready`);
			return;
		}
		const currentAccount = accountData.state.account;
		accountData.addOperation(
			currentAccount,
			{
				transactions: [
					{
						broadcastTimestampMs: transaction.broadcastTimestampMs,
						from: transaction.from,
						hash: transaction.hash,
						nonce: transaction.nonce,
					},
				],
			},
			transaction.metadata,
		);
	});

	txOberserver.on('intent:status', (event) => {
		const operationID = Number(event.id);
		if (accountData.state.status === 'ready') {
			// tx-observer is built in a way that we can be sure that the tx belong to the current account
			const account = accountData.state.account;
			const currentOperation = accountData.state.data.operations[operationID];
			if (currentOperation) {
				currentOperation.transactionIntent = event.intent;
				accountData.setOperation(account, operationID, currentOperation);
			} else {
				console.error(`operation with id ${operationID} not found`);
				// TODO remove from tx observer ?
			}
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
		publicClient: publicClient as any, // TODO fix publicClient type
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
		},
		start: () => {
			// to keep balance in memory
			// TODO use an methodology to handle this when wanted
			const unsubscribeFromBalance = balance.subscribe(() => {});
			// TODO remove
			// we trigger it
			const unsubscribeFromGasFee = gasFee.subscribe((v) => {
				console.log(`gas fee updated`, v);
			});
			accountData.start();

			const txObserverInterval = setInterval(() => {
				txOberserver.process();
			}, 2 * 1000); // TODO delay or use onNewBlock hook

			return () => {
				clearInterval(txObserverInterval);
				unsubscribeFromBalance();
				unsubscribeFromGasFee();
				accountData.stop();
			};
		},
	};
}
