import {deployments} from '$lib/deployments-store';
import {createConnection} from '@etherplay/connect';
import {derived} from 'svelte/store';
import {createPublicClient, createWalletClient, custom} from 'viem';
import type {
	Account,
	ChainInfo,
	EstablishedConnection,
	OptionalSigner,
	TypedPublicClient,
} from './types';

export async function establishRemoteConnection(options?: {
	nodeURL?: string;
	chainInfoNodeURL?: string;
}): Promise<EstablishedConnection> {
	// Use deployments.get() for synchronous access
	const currentDeployments = deployments.get();

	// Cast to ChainInfo to preserve the literal type even when modifying rpcUrls
	// The structure is the same, just the RPC URL may change
	const chainInfo: ChainInfo = options?.chainInfoNodeURL
		? ({
				...currentDeployments.chain,
				rpcUrls: {
					...currentDeployments.chain.rpcUrls,
					default: {
						...currentDeployments.chain.rpcUrls.default,
						http: [options.chainInfoNodeURL],
					},
				},
			} as ChainInfo)
		: currentDeployments.chain;

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

	return {
		connection,
		walletClient,
		publicClient,
		account,
		signer,
		deployments, // Use the imported HMR-aware store
	};
}
