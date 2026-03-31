import deploymentsFromFiles from '$lib/deployments';
import {createConnection} from '@etherplay/connect';
import {derived, writable} from 'svelte/store';
import {createPublicClient, createWalletClient, custom} from 'viem';
import type {
	Account,
	ChainInfo,
	DeploymentsStore,
	EstablishedConnection,
	OptionalSigner,
	TypedDeployments,
	TypedPublicClient,
	TypedWalletClient,
} from './types';

// TODO allow to specify the expected DeploymentStore type
export async function establishRemoteConnection(options?: {
	nodeURL?: string;
	chainInfoNodeURL?: string;
}): Promise<EstablishedConnection> {
	// Cast to ChainInfo to preserve the literal type even when modifying rpcUrls
	// The structure is the same, just the RPC URL may change
	const chainInfo: ChainInfo = options?.chainInfoNodeURL
		? ({
				...deploymentsFromFiles.chain,
				rpcUrls: {
					...deploymentsFromFiles.chain.rpcUrls,
					default: {
						...deploymentsFromFiles.chain.rpcUrls.default,
						http: [options.chainInfoNodeURL],
					},
				},
			} as ChainInfo)
		: deploymentsFromFiles.chain;

	const connection = createConnection({
		targetStep: 'WalletConnected',
		useCurrentAccount: 'whenSingle',
		nodeURL: options?.nodeURL,
		chainInfo,
		prioritizeWalletProvider: true,
		autoConnect: true,
	});

	const walletClient = createWalletClient({
		chain: chainInfo,
		transport: custom(connection.provider),
	});

	const publicClient = createPublicClient({
		chain: chainInfo,
		transport: custom(connection.provider),
	}) as TypedPublicClient;

	const account = derived<typeof connection, Account>(
		connection,
		($connection) => {
			return 'account' in $connection ? $connection.account.address : undefined;
		},
	);

	const signer = derived<typeof connection, OptionalSigner>(
		connection,
		($connection) => {
			return $connection.step === 'SignedIn'
				? {
						owner: $connection.account.address,
						address: $connection.account.signer.address,
						privateKey: $connection.account.signer.privateKey,
					}
				: undefined;
		},
	);

	let lastDeployments: TypedDeployments = deploymentsFromFiles;

	// TODO
	// we can specify LinkedData type for each contracts
	const deploymentsStore = writable<TypedDeployments>(
		lastDeployments,
		(set) => {
			// TODO handle redeployment
			// lastDeployments =
		},
	);

	const deployments: DeploymentsStore = {
		subscribe: deploymentsStore.subscribe,
		get current() {
			return lastDeployments;
		},
	};

	return {
		connection,
		walletClient,
		publicClient,
		account,
		signer,
		deployments,
	};
}
