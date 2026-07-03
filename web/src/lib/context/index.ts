import type {Context, TxObserverDebugState} from './types.js';
import {writable, derived} from 'svelte/store';
import {createWalletClient, custom, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
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
import {
	PUBLIC_NODE_URL,
	PUBLIC_USE_BURNER_WALLET,
	PUBLIC_WALLET_HOST,
	PUBLIC_EXECUTION_MODE,
} from '$env/static/public';
import {burnerOverride} from '$lib';
import {resolveBurnerWallet} from './burner.js';
import {resolveConnectionMode} from '$lib/core/connection/mode.js';
import {createExecutor} from '$lib/core/connection/executor.js';
import {createAccountCannotSendStore} from '$lib/core/transaction/account-cannot-send-store.js';
import {createErrorDetailsStore} from '$lib/core/transaction/error-details-store.js';
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

	const burner = resolveBurnerWallet(
		burnerOverride,
		PUBLIC_USE_BURNER_WALLET,
		PUBLIC_NODE_URL,
	);
	// An explicit `?burner=true` that cannot be honoured surfaces as an error
	// (rendered by AsyncContext's catch block) rather than being silently ignored.
	if (burner.use === false && burner.error) {
		throw new Error(burner.error);
	}
	if (burner.use) {
		const {cleanup} = initBurnerWallet({
			nodeURL: burner.nodeURL,
			impersonateAddresses: [...IMPERSONATE_ADDRESSES],
		});
		cleanupBurnerWallet = cleanup;
	}

	// Resolve the connection + execution mode from env. The one illegal
	// combination (signer execution without hosted sign-in) fails fast here and
	// is surfaced by AsyncContext's error screen.
	const modeResolution = resolveConnectionMode(
		PUBLIC_WALLET_HOST,
		PUBLIC_EXECUTION_MODE,
	);
	if (!modeResolution.ok) {
		throw new Error(modeResolution.error);
	}
	const {walletHost, executionMode} = modeResolution.mode;

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
		walletHost,
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
	const trackerBuilder = createTrackedWalletClient({
		populateMetadata: true,
		clock: () => clock.now(),
	});
	const walletClient = trackerBuilder.using(rawWalletClient, publicClient);

	// ----------------------------------------------------------------------------
	// TRANSACTION EXECUTOR
	// ----------------------------------------------------------------------------
	// Mode-agnostic front for sending transactions (wallet account vs local
	// signer). Call sites use this instead of the wallet client + account address.
	//
	// The signer-mode client is built HERE (not inside the executor) because this
	// is where its concrete pieces live: the chain from deployments, the node RPC
	// URL, and the same tracker config as `walletClient` (so signer-mode
	// transactions get identical metadata/observation wiring). The executor only
	// sees the finished tracked client, keeping it free of construction concerns.
	const executor = createExecutor({
		connection,
		walletClient,
		executionMode,
		buildSignerClient: (privateKey) => {
			const account = privateKeyToAccount(privateKey);
			const raw = createWalletClient({
				account,
				chain: deployments.get().chain,
				// Broadcast over the node RPC when configured (a local signer does not
				// need the wallet provider); fall back to the connection provider.
				transport: PUBLIC_NODE_URL
					? http(PUBLIC_NODE_URL)
					: custom(connection.provider),
			});
			return {client: trackerBuilder.using(raw, publicClient), account};
		},
	});

	const accountCannotSend = createAccountCannotSendStore();
	const errorDetails = createErrorDetailsStore();

	// The address that actually pays for transactions: the wallet/owner in wallet
	// mode, the local signer in signer mode. Balance checks and the top-bar
	// balance follow this (so the shown/gating balance matches the sender).
	const executorAddress = derived(executor, ($executor) =>
		$executor.status === 'ready' ? $executor.address : undefined,
	);

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
		// Injected wallets (e.g. MetaMask) can keep serving a stale pending view
		// from eth_getTransactionByHash (blockNumber null) for an already-mined
		// tx, while eth_getTransactionReceipt returns the real receipt. Fetch the
		// receipt directly in that case so inclusion is detected through the
		// user's own wallet-configured node (no dedicated/hardcoded RPC needed).
		alwaysFetchReceipt: true,
	});

	const tabLeader = createTabLeaderService();

	const trackedWalletConnector = createTrackedWalletConnector({
		walletClient,
		executor,
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

	// Spending balance: the address that pays for transactions (executor).
	const balance = createBalanceStore({
		publicClient,
		account: executorAddress,
	});

	// Owner balance: the authenticated account (wallet/owner). In signer mode it
	// is a distinct account (whose funds can top up the signer), so it gets its
	// own poller. In wallet mode owner and spender are the same account, so it IS
	// the same store instance: consumers can subscribe to both without causing a
	// second poll for the same address.
	const ownerBalance =
		executionMode === 'signer'
			? createBalanceStore({publicClient, account})
			: balance;

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
		ownerBalance,
		rpcHealth,
		offline,
		connection,
		walletClient,
		executor,
		executionMode,
		accountCannotSend,
		errorDetails,
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
