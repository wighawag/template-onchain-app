import {writable, derived, get} from 'svelte/store';
import {scanLatestTransactions} from '../services/blockScanner';
import type {TransactionSummary} from '../services/blockScanner';
import type {PublicClient} from 'viem';

/**
 * Transaction list store state
 */
export interface TransactionListState {
	transactions: TransactionSummary[];
	loading: boolean;
	error: string | null;
	lastBlockNumber: bigint | null;
}

const initialState: TransactionListState = {
	transactions: [],
	loading: false,
	error: null,
	lastBlockNumber: null,
};

/**
 * Options for creating a transaction list store
 */
export interface TransactionListStoreOptions {
	useBlockIndex?: boolean;
}

/**
 * Create a transaction list store
 * This is a generic Svelte store that can be used in any framework
 * @param options - Configuration options for the store
 */
export function createTransactionListStore(options: TransactionListStoreOptions = {}) {
	const useBlockIndex = options.useBlockIndex ?? false;
	const {subscribe, set, update} = writable<TransactionListState>(initialState);

	let currentPublicClient: PublicClient | null = null;

	/**
	 * Set the public client to use for fetching transactions
	 */
	function setPublicClient(client: PublicClient | null) {
		currentPublicClient = client;
	}

	/**
	 * Fetch latest transactions
	 */
	async function fetchTransactions(targetCount: number = 20): Promise<void> {
		if (!currentPublicClient) {
			update((state) => ({...state, error: 'Public client not available'}));
			return;
		}

		update((state) => ({...state, loading: true, error: null}));

		try {
			const txs = await scanLatestTransactions(
				currentPublicClient,
				targetCount,
				5, // batchSize
				100, // maxBlocksToScan
				useBlockIndex,
			);

			update((state) => ({
				...state,
				transactions: txs,
				lastBlockNumber:
					txs.length > 0 ? txs[0].blockNumber : state.lastBlockNumber,
				loading: false,
			}));
		} catch (e: any) {
			console.error('Error fetching transactions:', e);
			update((state) => ({
				...state,
				error: e.message || 'Failed to fetch transactions',
				loading: false,
			}));
		}
	}

	/**
	 * Refresh transactions (refetch from blockchain)
	 */
	async function refresh(): Promise<void> {
		const state = get({subscribe});
		await fetchTransactions(
			state.transactions.length > 0 ? state.transactions.length : 20,
		);
	}

	/**
	 * Reset the store to initial state
	 */
	function reset(): void {
		set(initialState);
	}

	return {
		subscribe,
		setPublicClient,
		fetchTransactions,
		refresh,
		reset,
	};
}

/**
 * Derived stores for individual properties (for convenience)
 */
export function createDerivedStores(
	store: ReturnType<typeof createTransactionListStore>,
) {
	return {
		transactions: derived(store, ($store) => $store.transactions),
		loading: derived(store, ($store) => $store.loading),
		error: derived(store, ($store) => $store.error),
		lastBlockNumber: derived(store, ($store) => $store.lastBlockNumber),
	};
}

// Create singleton instance
let transactionListStore: ReturnType<typeof createTransactionListStore> | null =
	null;

/**
 * Get the transaction list store singleton
 * @param options - Configuration options for the store (only used on first call)
 */
export function getTransactionListStore(options: TransactionListStoreOptions = {}) {
	if (!transactionListStore) {
		transactionListStore = createTransactionListStore(options);
	}
	return transactionListStore;
}
