import type {OptionalSigner} from '$lib/core/connection/types';
import type {Readable} from 'svelte/store';
import type {PublicClient} from 'viem';
import {
	createPollingStore,
	type PollingStore,
	type PollingValue,
	type PollingStatus,
} from './polling-store';

export type SignerBalanceValue = PollingValue<{signer: bigint; owner: bigint}>;
export type SignerBalanceStatus = PollingStatus;
export type SignerBalanceStore = PollingStore<{signer: bigint; owner: bigint}>;

export function createSignerBalanceStore(
	params: {
		publicClient: PublicClient;
		signer: Readable<OptionalSigner>;
	},
	options?: {
		fetchInterval?: number;
	},
): SignerBalanceStore {
	const {publicClient, signer} = params;

	return createPollingStore(
		async (currentSigner: OptionalSigner) => {
			const [signerBalance, ownerBalance] = await Promise.all([
				publicClient.getBalance({address: currentSigner!.address}),
				publicClient.getBalance({address: currentSigner!.owner}),
			]);
			return {signer: signerBalance, owner: ownerBalance};
		},
		{
			fetchInterval: options?.fetchInterval ?? 5 * 1000,
			source: {
				store: signer,
				key: (s) => s?.address,
			},
		},
	);
}
