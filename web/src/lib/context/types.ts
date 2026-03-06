import type {PublicClient} from 'viem';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';
import type {
	AccountStore,
	ChainConnection,
	DeploymentsStore,
} from '$lib/core/connection/types';
import type {TrackedWalletClient} from '@etherkit/viem-tx-tracker';
import type {AccountData} from '$lib/account/AccountData';

export type Context = {
	gasFee: GasFeeStore;
	balance: BalanceStore;
	connection: ChainConnection;
	/**
	 * Tracked wallet client that wraps the underlying viem WalletClient.
	 * Supports optional `metadata` field on writeContract/sendTransaction for tracking.
	 */
	walletClient: TrackedWalletClient;
	publicClient: PublicClient;
	account: AccountStore;
	deployments: DeploymentsStore;
	accountData: AccountData;
};
