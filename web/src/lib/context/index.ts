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
	const walletClient = createTrackedWalletClient(rawWalletClient, publicClient);
	window.walletClient = walletClient;

	// ----------------------------------------------------------------------------

	const accountData = createAccountData({
		account,
		deployments: deployments.current,
	});

	const txOberserver = createTransactionObserver({
		finality: 12, //TODO
		provider: connection.provider,
	});

	accountData.on('operations:cleared', () => {
		txOberserver.clear();
	});
	accountData.on('operations:set', (operations) => {
		const intents: {[id: string]: TransactionIntent} = {};
		for (const id in operations) {
			intents[id] = operations[id].transactionIntent;
		}
		txOberserver.addMultiple(intents);
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
						broadcastTimestamp: transaction.initiatedAt, // TODO rename viem-tx-tracker type field
						from: transaction.from,
						hash: transaction.txHash, // TODO rename viem-tx-tracker type field
						nonce: transaction.nonce,
					},
				],
			},
			transaction.metadata?.description || 'unknown',
			'default',
		);
	});

	txOberserver.on('intent:status', (event) => {
		const operationID = Number(event.id);
		if (accountData.state.status === 'ready') {
			// TODO handle account
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
