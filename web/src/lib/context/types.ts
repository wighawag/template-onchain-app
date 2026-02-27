import type {
	ConnectionStore,
	UnderlyingEthereumProvider,
} from '@etherplay/connect';
import type {PublicClient, WalletClient} from 'viem';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';
import type {AccountStore, DeploymentsStore} from '$lib/core/connection/types';

export type Context = {
	gasFee: GasFeeStore;
	balance: BalanceStore;
	paymentConnection: ConnectionStore<UnderlyingEthereumProvider>;
	paymentWalletClient: WalletClient;
	paymentPublicClient: PublicClient;
	connection: ConnectionStore<UnderlyingEthereumProvider>;
	walletClient: WalletClient;
	publicClient: PublicClient;
	account: AccountStore;
	deployments: DeploymentsStore;
};
