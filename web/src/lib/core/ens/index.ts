import {createPublicClient, http} from 'viem';
import {mainnet} from 'viem/chains';
import {logs} from 'named-logs';
import {PUBLIC_ENS_NODE_URL} from '$env/static/public';

const logger = logs('ens');

export type ENSResult = {
	name: string | null;
	loading: boolean;
	error?: Error;
};

export type ENSCache = Map<`0x${string}`, ENSResult>;

export type ENSContext = {
	fetchENS: (address: `0x${string}`) => Promise<string | null>;
	getENSState: (address: `0x${string}`) => ENSResult;
};

// Create the public client once for all ENS lookups
const publicClient = createPublicClient({
	chain: mainnet,
	transport: http(PUBLIC_ENS_NODE_URL || undefined),
});

/**
 * Creates an ENS service with in-memory caching.
 * Each address lookup is cached, preventing duplicate requests.
 */
export function createENSService(): ENSContext {
	const cache: ENSCache = new Map();
	const pendingRequests = new Map<`0x${string}`, Promise<string | null>>();

	/**
	 * Get the current ENS state for an address (synchronous).
	 * Returns the cached state or a default loading state.
	 */
	function getENSState(address: `0x${string}`): ENSResult {
		const cached = cache.get(address);
		if (cached) {
			return cached;
		}
		return {name: null, loading: false};
	}

	/**
	 * Fetch ENS name for an address with caching.
	 * If a request is already in progress for this address, returns the same promise.
	 * If the result is cached, returns it immediately.
	 */
	async function fetchENS(address: `0x${string}`): Promise<string | null> {
		// Check if we already have a cached result
		const cached = cache.get(address);
		if (cached && !cached.loading) {
			logger.debug(`ENS cache hit for ${address}: ${cached.name}`);
			return cached.name;
		}

		// Check if there's already a pending request for this address
		const pending = pendingRequests.get(address);
		if (pending) {
			logger.debug(`ENS request already pending for ${address}`);
			return pending;
		}

		// Set loading state
		cache.set(address, {name: null, loading: true});

		// Create the fetch promise
		const fetchPromise = (async (): Promise<string | null> => {
			try {
				logger.debug(`Fetching ENS for ${address}`);
				const name = await publicClient.getEnsName({address});
				logger.debug(`ENS resolved for ${address}: ${name}`);

				cache.set(address, {name, loading: false});
				return name;
			} catch (error) {
				logger.debug(`Failed to fetch ENS for ${address}`, error);
				cache.set(address, {
					name: null,
					loading: false,
					error: error instanceof Error ? error : new Error(String(error)),
				});
				return null;
			} finally {
				pendingRequests.delete(address);
			}
		})();

		pendingRequests.set(address, fetchPromise);
		return fetchPromise;
	}

	return {
		fetchENS,
		getENSState,
	};
}

export {default as ENSProvider} from './ENSProvider.svelte';
