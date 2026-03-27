import type {Context} from './types.js';

import {createAccountData} from '$lib/account/AccountData.js';
import {establishRemoteConnection} from '$lib/core/connection';
import {createBalanceStore} from '$lib/core/connection/balance.js';
import {createGasFeeStore} from '$lib/core/connection/gasFee';
import {createOnchainState} from '$lib/onchain/state.js';
import {createViewState} from '$lib/view/index.js';
import {createTransactionObserver} from '@etherkit/tx-observer';
import {createTabLeaderService} from '$lib/core/tab-leader';
import {createTrackedWalletClient} from '@etherkit/viem-tx-tracker';
import {
	createTrackedWalletConnector,
	createTransactionObserverConnector,
	createOnchainStateRefreshConnector,
} from '$lib/account/connectors.js';
import {createToastConnector} from '$lib/account/toastConnector.js';

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

	const config = {
		maxMessages: 10,
	};

	const onchainState = createOnchainState({
		publicClient,
		deployments: deployments.current,
		config,
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

	const tabLeader = createTabLeaderService();
	window.tabLeader = tabLeader;

	const trackedWalletConnector = createTrackedWalletConnector({
		walletClient,
		accountData,
	});

	const txObserverConnector = createTransactionObserverConnector({
		accountData,
		txObserver,
	});

	const toastConnector = createToastConnector({
		accountData,
	});

	const onchainStateRefreshConnector = createOnchainStateRefreshConnector({
		txObserver,
		onchainState,
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
		config,
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

			tabLeader.start();

			let txObserverInterval: ReturnType<typeof setInterval> | undefined;

			const unsubscribeFromLeader = tabLeader.isLeader.subscribe((isLeader) => {
				if (isLeader) {
					// Became leader: start processing immediately
					txObserver.process();
					txObserverInterval = setInterval(() => {
						txObserver.process();
					}, 2 * 1000);
				} else {
					// Lost leadership: stop processing
					if (txObserverInterval !== undefined) {
						clearInterval(txObserverInterval);
						txObserverInterval = undefined;
					}
				}
			});

			trackedWalletConnector.connect();
			txObserverConnector.connect();
			toastConnector.connect();
			onchainStateRefreshConnector.connect();

			return () => {
				trackedWalletConnector.disconnect();
				txObserverConnector.disconnect();
				toastConnector.disconnect();
				onchainStateRefreshConnector.disconnect();
				unsubscribeFromLeader();
				if (txObserverInterval !== undefined) {
					clearInterval(txObserverInterval);
				}
				tabLeader.stop();
				unsubscribeFromBalance();
				unsubscribeFromGasFee();
			};
		},
	};
}
