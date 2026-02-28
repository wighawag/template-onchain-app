import type {
	ConnectionStore,
	UnderlyingEthereumProvider,
} from '@etherplay/connect';
import type {PublicClient, WalletClient} from 'viem';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';
import type {AccountStore, DeploymentsStore} from '$lib/core/connection/types';
import type {TrackedWalletClient} from '$lib/core/transactions';

export type Context = {
	gasFee: GasFeeStore;
	balance: BalanceStore;
	paymentConnection: ConnectionStore<UnderlyingEthereumProvider>;
	paymentWalletClient: WalletClient;
	paymentPublicClient: PublicClient;
	connection: ConnectionStore<UnderlyingEthereumProvider>;
	/**
	 * Tracked wallet client that wraps the underlying viem WalletClient.
	 * Supports optional `metadata` field on writeContract/sendTransaction for tracking.
	 * The underlying WalletClient is accessible via walletClient.walletClient if needed.
	 */
	walletClient: TrackedWalletClient;
	publicClient: PublicClient;
	account: AccountStore;
	deployments: DeploymentsStore;
};
