import deploymentsFromFiles from '$lib/deployments';
import type {
	ConnectionStore,
	UnderlyingEthereumProvider,
} from '@etherplay/connect';
import type {Readable} from 'svelte/store';
import type {
	Account as ViemAccount,
	Chain,
	CustomTransport,
	PublicClient,
	Transport,
	WalletClient,
} from 'viem';

export type Signer = {
	owner: `0x${string}`;
	address: `0x${string}`;
	privateKey: `0x${string}`;
};
export type OptionalSigner = Signer | undefined;
export type OptionalSignerStore = Readable<OptionalSigner>;

export type Account = `0x${string}` | undefined;
export type AccountStore = Readable<Account>;

export type TypedDeployments = typeof deploymentsFromFiles;

/**
 * Chain type derived from deployments - preserves literal types for better inference
 */
export type ChainInfo = TypedDeployments['chain'];

/**
 * Typed wallet client with chain info from deployments
 */
export type TypedWalletClient = WalletClient<
	CustomTransport,
	ChainInfo,
	ViemAccount | undefined
>;

/**
 * Typed public client with chain info from deployments
 */
export type TypedPublicClient = PublicClient<CustomTransport, ChainInfo>;

export type DeploymentsStore = Readable<TypedDeployments> & {
	current: TypedDeployments;
};

export type ChainConnection = ConnectionStore<
	UnderlyingEthereumProvider,
	'WalletConnected',
	true
>;

export type EstablishedConnection = {
	connection: ChainConnection;
	walletClient: TypedWalletClient;
	publicClient: TypedPublicClient;
	account: AccountStore;
	signer: OptionalSignerStore;
	deployments: DeploymentsStore;
};
