import type {Context, TxObserverDebugState} from './types.js';
import {writable} from 'svelte/store';
import {createAccountData} from '$lib/account/AccountData.js';
import {establishRemoteConnection} from '$lib/core/connection';
import {createBalanceStore} from '$lib/core/connection/balance';
import {createGasFeeStore} from '$lib/core/connection/gasFee';
import {createRpcHealthStore} from '$lib/core/connection/rpcHealth';
import {createOfflineStore} from '$lib/core/connection/offline';
import {createClockStore} from '$lib/core/clock';
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
import {initBurnerWallet} from '@etherkit/burner-wallet';
import {PUBLIC_NODE_URL, PUBLIC_USE_BURNER_WALLET} from '$env/static/public';
import type {AugmentedChainInfo} from '$lib/core/connection/types.js';
import {createBalanceCheckStore} from '$lib/core/transaction/balance-check-store.js';
import {resolveAppConfig} from './config.js';
import {startTxObserverLoop} from '$lib/core/tx-observer';
import {IMPERSONATE_ADDRESSES} from '$lib/dev-accounts.js';

export async function createContext(): Promise<{
	context: Context;
	start: () => () => void;
}> {
	let cleanupBurnerWallet: (() => void) | undefined;

	if (
		PUBLIC_USE_BURNER_WALLET &&
		(PUBLIC_USE_BURNER_WALLET.startsWith('http') || PUBLIC_NODE_URL)
	) {
		const {cleanup} = initBurnerWallet({
			nodeURL: PUBLIC_USE_BURNER_WALLET.startsWith('http')
				? PUBLIC_USE_BURNER_WALLET
				: PUBLIC_NODE_URL,
			impersonateAddresses: [...IMPERSONATE_ADDRESSES],
		});
		cleanupBurnerWallet = cleanup;
	}

	// ----------------------------------------------------------------------------
	// CONNECTION
	// ----------------------------------------------------------------------------

	const {
		connection,
		walletClient: rawWalletClient,
		publicClient,
		account,
		deployments,
	} = await establishRemoteConnection({
		nodeURL: PUBLIC_NODE_URL,
		// chainInfoNodeURL
	});

	// ----------------------------------------------------------------------------
	// CHAIN CONFIGURATION
	// ----------------------------------------------------------------------------

	// Resolve chain-specific configuration (finality, block time, intervals)
	// from the chain's optional properties + defaults.
	const chain = deployments.get().chain as AugmentedChainInfo;
	const {finality, txObserverProcessInterval, maxMessages} =
		resolveAppConfig(chain);

	// Reactive clock store that updates every second for smooth "time ago" displays
	const clock = createClockStore();

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

	// ----------------------------------------------------------------------------

	const config = {maxMessages};

	const onchainState = createOnchainState({
		publicClient,
		deployments: deployments.get(),
		config,
	});

	const accountData = createAccountData({
		accountStore: account,
		deployments: deployments.get(),
		clock,
	});

	const txObserver = createTransactionObserver({
		finality,
		provider: connection.provider,
	});

	const tabLeader = createTabLeaderService();

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

	const gasFee = createGasFeeStore({
		publicClient: publicClient,
	});

	const rpcHealth = createRpcHealthStore({balance, gasFee});
	const offline = createOfflineStore();

	const viewState = createViewState({
		onchainState,
		operations: accountData.watchField('operations'),
		config,
	});

	const balanceCheck = createBalanceCheckStore({
		publicClient,
		balance,
		gasFee,
	});

	// Debug store for tx-observer processing stats
	const txObserverDebug = writable<TxObserverDebugState>({
		processCount: 0,
		lastProcessTime: null,
		isLeader: false,
	});

	const context: Context = {
		gasFee,
		balance,
		rpcHealth,
		offline,
		connection,
		walletClient,
		publicClient,
		account,
		deployments,
		accountData,
		onchainState,
		viewState,
		clock,
		txObserver,
		txObserverDebug: {subscribe: txObserverDebug.subscribe},
		balanceCheck,
	};

	// Dev/debug: expose the whole context on globalThis for console access
	// (e.g. `context.balance`). Self-maintaining: new context members appear
	// automatically. Delete this line if you don't want it.
	(globalThis as any).context = context;

	return {
		context,
		start: () => {
			// we trigger it so it is always availabe
			const unsubscribeFromBalance = balance.subscribe(() => {});
			// we trigger it so it is always availabe
			const unsubscribeFromGasFee = gasFee.subscribe(() => {});

			tabLeader.start();

			const stopTxObserverLoop = startTxObserverLoop({
				tabLeader,
				txObserver,
				intervalMs: txObserverProcessInterval,
				// App concern: record debug stats. The core loop stays free of any
				// app-specific state shape.
				onProcess: () =>
					txObserverDebug.update((state) => ({
						...state,
						processCount: state.processCount + 1,
						lastProcessTime: Date.now(),
					})),
				onLeadershipChange: (isLeader) =>
					txObserverDebug.update((state) => ({...state, isLeader})),
			});

			trackedWalletConnector.connect();
			txObserverConnector.connect();
			toastConnector.connect();
			onchainStateRefreshConnector.connect();

			return () => {
				cleanupBurnerWallet?.();
				trackedWalletConnector.disconnect();
				txObserverConnector.disconnect();
				toastConnector.disconnect();
				onchainStateRefreshConnector.disconnect();
				stopTxObserverLoop();
				tabLeader.stop();
				unsubscribeFromBalance();
				unsubscribeFromGasFee();
			};
		},
	};
}
