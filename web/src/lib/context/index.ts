import type {Context, TxObserverDebugState} from './types.js';
import {writable} from 'svelte/store';
import {createAccountData} from '$lib/account/AccountData.js';
import {establishRemoteConnection} from '$lib/core/connection';
import {createBalanceStore} from '$lib/core/connection/balance.js';
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

// ============================================================================
// Default Configuration Values
// ============================================================================

/** Default finality for chains without explicit configuration (Ethereum mainnet default) */
const DEFAULT_FINALITY = 12;

/** Default block time in ms for chains without explicit configuration (Ethereum mainnet ~12s) */
const DEFAULT_BLOCK_TIME_MS = 12000;

/** Minimum process interval to avoid excessive polling */
const MIN_PROCESS_INTERVAL_MS = 1000;

/** Default number of messages to display */
const DEFAULT_MAX_MESSAGES = 10;

/**
 * Calculate tx-observer process interval from block time.
 * Uses half the block time, clamped to a minimum threshold.
 */
function calculateProcessInterval(blockTimeMs: number): number {
	return Math.max(Math.floor(blockTimeMs / 2), MIN_PROCESS_INTERVAL_MS);
}

export async function createContext(): Promise<{
	context: Context;
	start: () => () => void;
}> {
	// Dev/debug: window alias for attaching debug properties to globalThis
	const window = globalThis as any;

	let cleanupBurnerWallet: (() => void) | undefined;

	// TODO use chainInfo if no publicNodeUrl ?
	if (
		PUBLIC_USE_BURNER_WALLET &&
		(PUBLIC_USE_BURNER_WALLET.startsWith('http') || PUBLIC_NODE_URL)
	) {
		const {cleanup} = initBurnerWallet({
			nodeURL: PUBLIC_USE_BURNER_WALLET.startsWith('http')
				? PUBLIC_USE_BURNER_WALLET
				: PUBLIC_NODE_URL,
			impersonateAddresses: [
				'0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
				'0xF78cD306b23031dE9E739A5BcDE61764e82AD5eF',
			],
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

	window.connection = connection;
	window.publicClient = publicClient;
	window.deployments = deployments;

	// ----------------------------------------------------------------------------
	// CHAIN CONFIGURATION
	// ----------------------------------------------------------------------------

	// Cast chain to augmented type for access to optional properties
	const chain = deployments.get().chain as AugmentedChainInfo;
	const chainProperties = chain.properties ?? {};

	// Extract chain-specific configuration with defaults
	const finality = chainProperties.finality ?? DEFAULT_FINALITY;
	const blockTimeMs =
		chainProperties.averageBlockTimeMs ?? DEFAULT_BLOCK_TIME_MS;
	const txObserverProcessInterval = calculateProcessInterval(blockTimeMs);

	// Reactive clock store that updates every second for smooth "time ago" displays
	const clock = createClockStore();
	window.clock = clock;

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
		maxMessages: DEFAULT_MAX_MESSAGES,
	};

	const onchainState = createOnchainState({
		publicClient,
		deployments: deployments.get(),
		config,
	});
	window.onchainState = onchainState;

	const accountData = createAccountData({
		accountStore: account,
		deployments: deployments.get(),
		clock,
	});
	window.accountData = accountData;

	const txObserver = createTransactionObserver({
		finality,
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
		deployments: deployments.get(),
	});
	window.gasFee = gasFee;

	const rpcHealth = createRpcHealthStore({balance, gasFee});
	window.rpcHealth = rpcHealth;
	const offline = createOfflineStore();
	window.offline = offline;
	// ----------------------------------------------------------------------------

	const viewState = createViewState({
		onchainState,
		operations: accountData.watchField('operations'),
		config,
	});
	window.viewState = viewState;

	// Debug store for tx-observer processing stats
	const txObserverDebug = writable<TxObserverDebugState>({
		processCount: 0,
		lastProcessTime: null,
		isLeader: false,
	});

	return {
		context: {
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
					txObserverDebug.update((state) => ({
						...state,
						isLeader: true,
						processCount: state.processCount + 1,
						lastProcessTime: Date.now(),
					}));
					txObserver.process();
					txObserverInterval = setInterval(() => {
						txObserverDebug.update((state) => ({
							...state,
							processCount: state.processCount + 1,
							lastProcessTime: Date.now(),
						}));
						txObserver.process();
					}, txObserverProcessInterval);
				} else {
					// Lost leadership: stop processing
					txObserverDebug.update((state) => ({...state, isLeader: false}));
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
				cleanupBurnerWallet?.();
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
