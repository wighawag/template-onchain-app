import deploymentsFromFiles from '$lib/deployments';
import {createConnection} from '@etherplay/connect';
import {derived, writable} from 'svelte/store';
import {
	createPublicClient,
	createWalletClient,
	custom,
	type Chain,
	type PublicClient,
	type Transport,
} from 'viem';
import type {
	Account,
	DeploymentsStore,
	EstablishedConnection,
	OptionalSigner,
	TypedDeployments,
} from './types';

// TODO allow to specify the expected DeploymentStore type
export async function establishRemoteConnection(): Promise<EstablishedConnection> {
	const chainInfo = deploymentsFromFiles.chain;

	const connection = createConnection({
		targetStep: 'WalletConnected',
		useCurrentAccount: 'whenSingle',
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
	}) as unknown as PublicClient<Transport, Chain, undefined>; // TODO anyway to reconciliate?

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
