import {
	createAccountStore,
	createMutations,
	type AsyncState,
} from '$lib/core/account/createAccountStore';
import {createLocalStorageAdapter, type AsyncStorage} from '$lib/core/storage';
import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import type {TransactionIntent} from '@etherkit/tx-observer';
import type {PopulatedMetadata} from '@etherkit/viem-tx-tracker';
import type {Readable} from 'svelte/store';

export type OnchainOperationMetadata = PopulatedMetadata;

export type OnchainOperation = {
	metadata: OnchainOperationMetadata;
	transactionIntent: TransactionIntent;
};

/**
 * Data stored per account
 */
export type AccountData = {
	operations: Record<number, OnchainOperation>;
};

/**
 * Event types emitted by the store.
 */
type Events = {
	/** Fires when an operation is added */
	'operations:added': {id: number; operation: OnchainOperation};
	/** Fires when an operation is removed */
	'operations:removed': {id: number; operation: OnchainOperation};
	/** Fires when all operations are cleared (account switch, before loading) */
	'operations:cleared': undefined;
	/** Fires when operations are set (initial load after account switch) */
	'operations:set': AccountData['operations'];
	/** Fires when an existing operation is modified (content changes only) */
	'operation:updated': {id: number; operation: OnchainOperation};
};

/**
 * Pure mutations - just business logic, no async/storage concerns!
 */
const mutations = createMutations<AccountData, Events>()({
	addOperation(
		data,
		transactionIntent: TransactionIntent,
		metadata: OnchainOperationMetadata,
	) {
		let id = Date.now();
		while (data.operations[id]) id++;
		const operation = {metadata, transactionIntent};
		data.operations[id] = operation;
		return {
			result: id,
			event: 'operations:added',
			eventData: {id, operation},
		};
	},

	setOperation(data, id: number, operation: OnchainOperation) {
		const isNew = !data.operations[id];
		data.operations[id] = operation;
		if (isNew) {
			return {
				result: undefined,
				event: 'operations:added',
				eventData: {id, operation},
			};
		}
		return {
			result: undefined,
			event: 'operation:updated',
			eventData: {id, operation},
		};
	},

	removeOperation(data, id: number) {
		const operation = data.operations[id];
		if (!operation) return {result: false};
		delete data.operations[id];
		return {
			result: true,
			event: 'operations:removed',
			eventData: {id, operation},
		};
	},
});

export function createAccountData(params: {
	account: AccountStore;
	deployments: TypedDeployments;
	storage?: AsyncStorage<AccountData>;
}) {
	const {
		account,
		deployments,
		storage = createLocalStorageAdapter<AccountData>(),
	} = params;

	const store = createAccountStore<AccountData, Events, typeof mutations>({
		account,
		storage,

		storageKey: (addr) =>
			`__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${addr}`,

		defaultData: () => ({operations: {}}),

		onClear: () => [{event: 'operations:cleared', data: undefined}],

		onLoad: (data) => [{event: 'operations:set', data: data.operations}],

		mutations,
	});

	// Cache for operation-specific stores
	const operationStoreCache = new Map<
		number,
		Readable<OnchainOperation | undefined>
	>();

	/**
	 * Get a Svelte-compatible store for a specific operation.
	 * Returns a cached store instance for the given ID.
	 * The store value is `undefined` when:
	 * - Account is not ready (idle/loading)
	 * - Operation with given ID doesn't exist
	 */
	function getOperationStore(
		id: number,
	): Readable<OnchainOperation | undefined> {
		// Return cached store if exists
		const cached = operationStoreCache.get(id);
		if (cached) return cached;

		// Helper to get current value
		const getCurrentValue = (): OnchainOperation | undefined => {
			const currentState = store.state;
			if (currentState.status !== 'ready') return undefined;
			return currentState.data.operations[id];
		};

		// Create new store
		const operationStore: Readable<OnchainOperation | undefined> = {
			subscribe(callback: (value: OnchainOperation | undefined) => void) {
				// Call immediately with current value (Svelte store contract)
				callback(getCurrentValue());

				// Subscribe to state changes (account switch, loading, etc.)
				const unsubState = store.on('state', () => {
					callback(getCurrentValue());
				});

				// Subscribe to specific operation updates
				const unsubUpdated = store.on('operation:updated', (event) => {
					if (event.id === id) {
						callback(event.operation);
					}
				});

				// Subscribe to operation removal
				const unsubRemoved = store.on('operations:removed', (event) => {
					if (event.id === id) {
						callback(undefined);
					}
				});

				// Return unsubscribe function
				return () => {
					unsubState();
					unsubUpdated();
					unsubRemoved();
				};
			},
		};

		operationStoreCache.set(id, operationStore);
		return operationStore;
	}

	// Clear cache on account switch
	store.on('operations:cleared', () => {
		operationStoreCache.clear();
	});

	// Create extended store with getOperationStore
	// Note: We can't use {...store} because it would snapshot the 'state' getter
	// Instead, we explicitly forward the getter to preserve reactivity
	const extendedStore = {
		get state() {
			return store.state;
		},
		addOperation: store.addOperation,
		setOperation: store.setOperation,
		removeOperation: store.removeOperation,
		on: store.on,
		off: store.off,
		start: store.start,
		stop: store.stop,
		/**
		 * Svelte-compatible subscribe method.
		 * Subscribes to state transitions and list-level changes only.
		 * Does NOT subscribe to 'operation:updated' - use getOperationStore for that.
		 */
		subscribe(
			callback: (state: Readonly<AsyncState<AccountData>>) => void,
		): () => void {
			// Call with current state immediately (Svelte store contract)
			callback(store.state);

			// Subscribe to state transitions (idle/loading/ready)
			const unsubState = store.on('state', callback);

			// Subscribe to list-level changes
			const unsubAdded = store.on('operations:added', () =>
				callback(store.state),
			);
			const unsubRemoved = store.on('operations:removed', () =>
				callback(store.state),
			);
			const unsubCleared = store.on('operations:cleared', () =>
				callback(store.state),
			);
			const unsubSet = store.on('operations:set', () => callback(store.state));

			// NOTE: We intentionally do NOT subscribe to 'operation:updated'
			// Individual operation updates are handled by getOperationStore

			return () => {
				unsubState();
				unsubAdded();
				unsubRemoved();
				unsubCleared();
				unsubSet();
			};
		},
		getOperationStore,
	};

	return extendedStore;
}

export type AccountDataStore = ReturnType<typeof createAccountData>;
