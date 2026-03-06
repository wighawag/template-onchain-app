import type {Context} from './types.js';

import {establishRemoteConnection} from '$lib/core/connection';
import {createBalanceStore} from '$lib/core/connection/balance';
import {createGasFeeStore} from '$lib/core/connection/gasFee';
import {createTrackedWalletClient} from '@etherkit/viem-tx-tracker';
import {initTransactionProcessor} from '@etherkit/tx-observer';
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

	const accountData = createAccountData({
		account,
		deployments: deployments.current,
	});

	const txOberserver = initTransactionProcessor({
		finality: 12, //TODO
		provider: connection.provider,
	});

	// accountData.on('operations', (operations) => {
	// 	// we need to know when an operation is removed
	// 	txOberserver.remove('1');
	// 	// we need to know when an operation (or multiple) is added
	// 	txOberserver.add(operations['1'].transactionIntent);
	// 	txOberserver.addMultiple(operations.map(op => op.transactionIntent));

	// 	// we need to know when operations are cleared (switching account)
	// 	txOberserver.clear();
	// });

	// txOberserver.onOperationStatusUpdated((intent) => {
	// 	const currentOperation = accountData.state.operations[intent.id.toString()];
	// 	// currentOperation.accountData.updateOperation(operation);
	// });

	// ----------------------------------------------------------------------------

	// ----------------------------------------------------------------------------
	// BALANCE AND COSTS
	// ----------------------------------------------------------------------------

	const balance = createBalanceStore({publicClient, signer});
	window.balance = balance;

	// ----------------------------------------------------------------------------

	// TODO use deployment store ?
	const gasFee = createGasFeeStore({
		publicClient: publicClient as any, // TODO fix publicClient type
		deployments: deployments.current,
	});
	window.gasFee = gasFee;
	// ----------------------------------------------------------------------------

	// ----------------------------------------------------------------------------
	// TRACKED WALLET CLIENT
	// ----------------------------------------------------------------------------

	// Wrap the raw wallet client with tracking capabilities
	// This is exposed as `walletClient` for drop-in compatibility
	// Use `walletClient.walletClient` to access the underlying viem WalletClient if needed
	const walletClient = createTrackedWalletClient(rawWalletClient, publicClient);
	window.walletClient = walletClient;

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
			const unsubscribeFromBalance = balance.subscribe((v) => {});
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
