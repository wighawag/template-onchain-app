import type {Account, CustomTransport} from 'viem';
import type {Readable} from 'svelte/store';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';
import type {RpcHealthStore} from '$lib/core/connection/rpcHealth';
import type {OfflineStore} from '$lib/core/connection/offline';
import type {
	AccountStore,
	ChainConnection,
	ChainInfo,
	DeploymentsStore,
	TypedPublicClient,
} from '$lib/core/connection/types';
import type {TrackedWalletClientAutoPopulate} from '@etherkit/viem-tx-tracker';
import type {
	MultiAccountDataStore,
	TransactionMetadata,
} from '$lib/account/AccountData';
import type {OnchainStateStore} from '$lib/onchain/state';
import type {ViewStateStore} from '$lib/view';
import type {ClockStore} from '$lib/core/clock';
import type {TransactionObserver} from '@etherkit/tx-observer';

/**
 * TrackedWalletClient with chain info from deployments.
 * This allows writeContract calls to have optional `chain` parameter
 * since the client already has a chain associated.
 */
export type WalletClient = TrackedWalletClientAutoPopulate<
	TransactionMetadata,
	CustomTransport,
	ChainInfo,
	Account | undefined
>;

export type Clock = ClockStore;

export type TxObserverDebugState = {
	processCount: number;
	lastProcessTime: number | null;
	isLeader: boolean;
};

export type TxObserverDebugStore = Readable<TxObserverDebugState>;

export type Context = {
	gasFee: GasFeeStore;
	balance: BalanceStore;
	rpcHealth: RpcHealthStore;
	offline: OfflineStore;
	connection: ChainConnection;
	/**
	 * Tracked wallet client that wraps the underlying viem WalletClient.
	 * Supports optional `metadata` field on writeContract/sendTransaction for tracking.
	 */
	walletClient: WalletClient;
	publicClient: TypedPublicClient;
	account: AccountStore;
	deployments: DeploymentsStore;
	accountData: MultiAccountDataStore;
	onchainState: OnchainStateStore;
	viewState: ViewStateStore;
	clock: Clock;
	txObserver: TransactionObserver;
	txObserverDebug: TxObserverDebugStore;
};
