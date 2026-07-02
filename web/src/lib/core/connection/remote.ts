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

/**
 * Create the app's connection store.
 *
 * This is the single place the connection is configured. Its inferred return
 * type is re-exported as `ChainConnection` (see ./types), so switching the
 * settings below (e.g. from `targetStep: 'WalletConnected'` to `'SignedIn'` plus
 * a `walletHost` to enable hosted email sign-in) automatically updates every
 * consumer's types without touching type definitions elsewhere.
 *
 * To enable hosted sign-in (email), replace the `targetStep: 'WalletConnected'`
 * line with `targetStep: 'SignedIn'` and add a `walletHost` pointing at your
 * hosted sign-in service. The Sign In UI (email input) then activates
 * automatically.
 */
export function createChainConnection(chainInfo: ChainInfo, nodeURL?: string) {
	return createConnection({
		targetStep: 'WalletConnected',
		// Note: `useCurrentAccount` is intentionally omitted. Setting it would make
		// the connection auto-pick an account and skip `ChooseWalletAccount`, so a
		// wallet exposing several accounts would never let the user choose. Omitting
		// it routes multi-account wallets to the account picker; single-account
		// wallets still go straight to `WalletConnected` (the confirm step).
		nodeURL,
		chainInfo,
		prioritizeWalletProvider: true,
		autoConnect: true,
	});
}

/** The connection store type, derived from the actual configuration above. */
export type ChainConnection = ReturnType<typeof createChainConnection>;

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

	const connection = createChainConnection(chainInfo, options?.nodeURL);

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
