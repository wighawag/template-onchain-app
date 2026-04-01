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

// ============================================================================
// Re-export all deployment-related types from the centralized store
// ============================================================================

export type {
	TypedDeployments,
	ChainInfo,
	AugmentedChainInfo,
	DeploymentsStore,
	TypedAugmentedDeployments,
	AugmentedDeployments,
	AugmentedChain,
	BlockExplorers,
	BlockExplorerConfig,
	KnownChainProperties,
	JSONValue,
} from '$lib/deployments-store';

// Import type for local use
import type {
	TypedDeployments,
	ChainInfo,
	DeploymentsStore,
} from '$lib/deployments-store';

// ============================================================================
// Signer and Account Types
// ============================================================================

export type Signer = {
	owner: `0x${string}`;
	address: `0x${string}`;
	privateKey: `0x${string}`;
};
export type OptionalSigner = Signer | undefined;
export type OptionalSignerStore = Readable<OptionalSigner>;

export type Account = `0x${string}` | undefined;
export type AccountStore = Readable<Account>;

// ============================================================================
// Client Types
// ============================================================================

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

// ============================================================================
// Connection Types
// ============================================================================

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
