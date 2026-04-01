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

// ============================================================================
// Chain Properties Types
// ============================================================================

/**
 * JSON-compatible value types for chain properties
 */
export type JSONValue =
	| string
	| number
	| boolean
	| null
	| JSONValue[]
	| {[key: string]: JSONValue};

/**
 * Known chain properties that can be specified in deployments.
 * All properties are optional to allow gradual adoption.
 */
export type KnownChainProperties = {
	/** Average block time in milliseconds (e.g., 12000 for Ethereum mainnet) */
	averageBlockTimeMs?: number;
	/** Number of blocks required for finality (e.g., 12 for Ethereum mainnet) */
	finality?: number;
};

/**
 * Block explorer configuration following viem's Chain format
 */
export type BlockExplorerConfig = {
	name: string;
	url: string;
	apiUrl?: string;
};

/**
 * Block explorers map with default and additional named explorers
 */
export type BlockExplorers = {
	default?: BlockExplorerConfig;
	[key: string]: BlockExplorerConfig | undefined;
};

/**
 * Augments a chain type with optional known properties.
 * Preserves the original const type while adding optional fields.
 */
export type AugmentedChain<T> = T & {
	properties?: Record<string, JSONValue> & KnownChainProperties;
	blockExplorers?: BlockExplorers;
};

/**
 * Augmented deployment type with proper chain typing.
 * Use this when you need access to optional chain properties.
 */
export type AugmentedDeployments<T extends {chain: unknown}> = Omit<
	T,
	'chain'
> & {
	chain: AugmentedChain<T['chain']>;
};

// ============================================================================
// Deployment Types
// ============================================================================

export type TypedDeployments = typeof deploymentsFromFiles;

/**
 * Augmented deployments with access to optional chain properties
 */
export type TypedAugmentedDeployments = AugmentedDeployments<TypedDeployments>;

/**
 * Chain type derived from deployments - preserves literal types for better inference
 */
export type ChainInfo = TypedDeployments['chain'];

/**
 * Augmented chain info with optional properties like finality, blockTime, and blockExplorers
 */
export type AugmentedChainInfo = AugmentedChain<ChainInfo>;

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
