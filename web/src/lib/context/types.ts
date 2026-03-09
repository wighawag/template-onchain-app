import type {PublicClient} from 'viem';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';
import type {
	AccountStore,
	ChainConnection,
	DeploymentsStore,
} from '$lib/core/connection/types';
import type {TrackedWalletClientAutoPopulate} from '@etherkit/viem-tx-tracker';
import type {
	AccountDataStore,
	OnchainOperationMetadata,
} from '$lib/account/AccountData';
import type {OnchainStateStore} from '$lib/onchain/state';

export type WalletClient =
	TrackedWalletClientAutoPopulate<OnchainOperationMetadata>;

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
	accountData: AccountDataStore;
	onchainState: OnchainStateStore;
};
