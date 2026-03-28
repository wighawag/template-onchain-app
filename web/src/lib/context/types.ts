import type {PublicClient} from 'viem';
import type {Readable} from 'svelte/store';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';
import type {
	AccountStore,
	ChainConnection,
	DeploymentsStore,
} from '$lib/core/connection/types';
import type {TrackedWalletClientAutoPopulate} from '@etherkit/viem-tx-tracker';
import type {
	MultiAccountDataStore,
	TransactionMetadata,
} from '$lib/account/AccountData';
import type {OnchainStateStore} from '$lib/onchain/state';
import type {ViewStateStore} from '$lib/view';
import type {TransactionObserver} from '@etherkit/tx-observer';

export type WalletClient = TrackedWalletClientAutoPopulate<TransactionMetadata>;

export type Clock = {
	now(): number;
};

export type TxObserverDebugState = {
	processCount: number;
	lastProcessTime: number | null;
	isLeader: boolean;
};

export type TxObserverDebugStore = Readable<TxObserverDebugState>;

export type Context = {
	gasFee: GasFeeStore;
	balance: BalanceStore;
	connection: ChainConnection;
	/**
	 * Tracked wallet client that wraps the underlying viem WalletClient.
	 * Supports optional `metadata` field on writeContract/sendTransaction for tracking.
	 */
	walletClient: WalletClient;
	publicClient: PublicClient;
	account: AccountStore;
	deployments: DeploymentsStore;
	accountData: MultiAccountDataStore;
	onchainState: OnchainStateStore;
	viewState: ViewStateStore;
	clock: Clock;
	txObserver: TransactionObserver;
	txObserverDebug: TxObserverDebugStore;
};
