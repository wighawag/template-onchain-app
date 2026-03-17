import type {Context} from './types.js';

import {establishRemoteConnection} from '$lib/core/connection';
import {createBalanceStore} from '$lib/core/connection/balance.js';
import {createGasFeeStore} from '$lib/core/connection/gasFee';
import {createTrackedWalletClient} from '@etherkit/viem-tx-tracker';
import {
	createTransactionObserver,
	type TransactionIntent,
} from '@etherkit/tx-observer';
import {
	createAccountData,
	createTrackedWalletConnector,
	createTransactionObserverConnector,
} from '$lib/account/AccountData.js';
import {createOnchainState} from '$lib/onchain/state.js';
import {createViewState} from '$lib/view/index.js';

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

	// TODO
	const clock = Date;

	// ----------------------------------------------------------------------------
	// TRACKED WALLET CLIENT
	// ----------------------------------------------------------------------------

	// Wrap the raw wallet client with tracking capabilities
	// This is exposed as `walletClient` for drop-in compatibility
	// Use `walletClient.walletClient` to access the underlying viem WalletClient if needed
	const walletClient = createTrackedWalletClient({
		populateMetadata: true,
		clock: () => clock.now(),
	}).using(rawWalletClient, publicClient);
	window.walletClient = walletClient;

	// ----------------------------------------------------------------------------

	const onchainState = createOnchainState({
		publicClient,
		deployments: deployments.current,
	});
	window.onchainState = onchainState;

	const accountData = createAccountData({
		accountStore: account,
		deployments: deployments.current,
		clock,
	});
	window.accountData = accountData;

	const txObserver = createTransactionObserver({
		finality: 12, //TODO
		provider: connection.provider,
	});
	window.txObserver = txObserver;

	const trackedWalletConnector = createTrackedWalletConnector({
		walletClient,
		accountData,
		clock,
	});

	const txObserverConnector = createTransactionObserverConnector({
		accountData,
		txObserver,
	});

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

	const viewState = createViewState({
		onchainState,
		operations: accountData.watchField('operations'),
	});
	window.viewState = viewState;

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
			viewState,
			clock,
		},
		start: () => {
			// we trigger it so it is always availabe
			const unsubscribeFromBalance = balance.subscribe(() => {});
			// we trigger it so it is always availabe
			const unsubscribeFromGasFee = gasFee.subscribe(() => {});

			const txObserverInterval = setInterval(() => {
				txObserver.process();
			}, 2 * 1000); // TODO delay or use onNewBlock hook
			trackedWalletConnector.connect();
			txObserverConnector.connect();

			return () => {
				trackedWalletConnector.disconnect();
				txObserverConnector.disconnect();
				clearInterval(txObserverInterval);
				unsubscribeFromBalance();
				unsubscribeFromGasFee();
			};
		},
	};
}
