/**
 * Simple Syncable Store - Main Store Factory
 *
 * Creates a type-safe syncable store with automatic timestamp management,
 * storage persistence, and event emission.
 */

import type {
	Schema,
	InternalStorage,
	DataOf,
	AsyncState,
	StoreStatus,
	PermanentKeys,
	MapKeys,
	ExtractPermanent,
	ExtractMapItem,
	DeepPartial,
	StoreChange,
} from './types';
import type { AsyncStorage } from '../storage';
import { cleanup } from './cleanup';
import { mergeStore } from './merge';
import { isWatchable } from '../storage';

// ============================================================================
// Account Store Interface (minimal interface for dependency injection)
// ============================================================================

/**
 * Minimal interface for account store subscription.
 */
export interface AccountStore {
	readonly current: `0x${string}` | undefined;
	subscribe(callback: (account: `0x${string}` | undefined) => void): () => void;
}

// ============================================================================
// Store Configuration
// ============================================================================

/**
 * Configuration for creating a syncable store.
 */
export interface SyncableStoreConfig<S extends Schema> {
	/** Schema definition */
	schema: S;

	/** Account store to subscribe to */
	account: AccountStore;

	/** Local storage adapter */
	storage: AsyncStorage<InternalStorage<S>>;

	/** Storage key generator */
	storageKey: (account: `0x${string}`) => string;

	/** Default data factory */
	defaultData: () => DataOf<S>;

	/** Clock function for timestamps (default: Date.now) */
	clock?: () => number;

	/** Schema version for migrations */
	schemaVersion?: number;
}

// ============================================================================
// Store Interface
// ============================================================================

/**
 * The syncable store interface.
 */
export interface SyncableStore<S extends Schema> {
	/** Current async state */
	readonly state: AsyncState<DataOf<S>>;

	/** Store status */
	readonly status: StoreStatus;

	/** Set a permanent field value */
	set<K extends PermanentKeys<S>>(field: K, value: ExtractPermanent<S[K]>): void;

	/** Patch a permanent field with partial updates */
	patch<K extends PermanentKeys<S>>(field: K, value: DeepPartial<ExtractPermanent<S[K]>>): void;

	/** Add an item to a map field */
	add<K extends MapKeys<S>>(
		field: K,
		key: string,
		value: ExtractMapItem<S[K]>,
		options: { deleteAt: number },
	): void;

	/** Update an existing map item */
	update<K extends MapKeys<S>>(field: K, key: string, value: ExtractMapItem<S[K]>): void;

	/** Remove an item from a map field */
	remove<K extends MapKeys<S>>(field: K, key: string): void;

	/** Subscribe to state changes (Svelte store contract) */
	subscribe(callback: (state: AsyncState<DataOf<S>>) => void): () => void;

	/** Subscribe to events */
	on<E extends string>(event: E, callback: (data: unknown) => void): () => void;

	/** Start watching account changes */
	start(): () => void;

	/** Stop watching */
	stop(): void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a syncable store.
 */
export function createSyncableStore<S extends Schema>(
	config: SyncableStoreConfig<S>,
): SyncableStore<S> {
	const {
		schema,
		account: accountStore,
		storage,
		storageKey,
		defaultData,
		clock = Date.now,
		schemaVersion = 1,
	} = config;

	// State
	let asyncState: AsyncState<DataOf<S>> = { status: 'idle', account: undefined };
	let internalStorage: InternalStorage<S> | null = null;
	let loadGeneration = 0;

	// Status
	const status: StoreStatus = {
		syncState: 'idle',
		pendingCount: 0,
		lastSyncedAt: null,
		syncError: null,
		storageState: 'idle',
		lastSavedAt: null,
		storageError: null,
		pendingSaves: 0,
		get hasError() {
			return this.syncError !== null || this.storageError !== null;
		},
		get hasUnsavedChanges() {
			return this.pendingSaves > 0;
		},
		get isBusy() {
			return this.syncState === 'syncing' || this.storageState === 'saving';
		},
	};

	// Event emitter
	const eventListeners = new Map<string, Set<(data: unknown) => void>>();

	function emit(event: string, data: unknown): void {
		const listeners = eventListeners.get(event);
		if (listeners) {
			for (const callback of listeners) {
				callback(data);
			}
		}
	}

	// State subscribers
	const stateSubscribers = new Set<(state: AsyncState<DataOf<S>>) => void>();

	function notifyStateChange(): void {
		for (const callback of stateSubscribers) {
			callback(asyncState);
		}
		emit('state', asyncState);
	}

	// Storage watch cleanup
	let unwatchStorage: (() => void) | undefined;

	// Account subscription cleanup
	let unsubscribeAccount: (() => void) | undefined;

	// Create default internal storage
	function createDefaultInternalStorage(): InternalStorage<S> {
		return {
			$version: schemaVersion,
			data: defaultData(),
			$timestamps: {} as InternalStorage<S>['$timestamps'],
			$itemTimestamps: {} as InternalStorage<S>['$itemTimestamps'],
			$tombstones: {} as InternalStorage<S>['$tombstones'],
		};
	}

	// Save to storage (fire-and-forget)
	async function saveToStorage(account: `0x${string}`): Promise<void> {
		if (!internalStorage) return;

		try {
			(status as { storageState: string }).storageState = 'saving';
			(status as { pendingSaves: number }).pendingSaves++;

			await storage.save(storageKey(account), internalStorage);

			(status as { lastSavedAt: number | null }).lastSavedAt = Date.now();
			(status as { storageError: Error | null }).storageError = null;
		} catch (error) {
			(status as { storageError: Error | null }).storageError = error as Error;
		} finally {
			(status as { pendingSaves: number }).pendingSaves--;
			if (status.pendingSaves === 0) {
				(status as { storageState: string }).storageState = 'idle';
			}
		}
	}

	// Set account (internal)
	async function setAccount(newAccount: `0x${string}` | undefined): Promise<void> {
		// Same account - no change
		if (newAccount === asyncState.account) return;

		// Clean up previous watch
		unwatchStorage?.();
		unwatchStorage = undefined;

		// Remember if we were ready
		const wasReady = asyncState.status === 'ready';

		// No account - transition to idle
		if (!newAccount) {
			asyncState = { status: 'idle', account: undefined };
			internalStorage = null;
			notifyStateChange();
			return;
		}

		// Transition to loading state
		asyncState = { status: 'loading', account: newAccount };
		notifyStateChange();

		// Increment generation for race condition handling
		loadGeneration++;
		const currentGeneration = loadGeneration;

		// Load from storage
		const localData = await storage.load(storageKey(newAccount));

		// Check if account changed during async load
		if (currentGeneration !== loadGeneration) return;

		internalStorage = localData ?? createDefaultInternalStorage();

		// Cleanup expired items
		internalStorage = cleanup(internalStorage, schema, clock());

		// Save cleaned state
		await storage.save(storageKey(newAccount), internalStorage);

		// Final check
		if (currentGeneration !== loadGeneration) return;

		// Transition to ready
		asyncState = {
			status: 'ready',
			account: newAccount,
			data: internalStorage.data,
		};
		notifyStateChange();

		// Set up storage watch for cross-tab sync
		if (isWatchable(storage)) {
			unwatchStorage = storage.watch(storageKey(newAccount), async (_, newValue) => {
				if (!newValue || !internalStorage) return;

				// Merge with current state
				const { merged, changes } = mergeStore(internalStorage, newValue, schema);

				internalStorage = merged;

				// Update async state data
				if (asyncState.status === 'ready') {
					asyncState = { ...asyncState, data: merged.data };
				}

				// Emit change events
				for (const change of changes) {
					emit(change.event, change.data);
				}

				if (changes.length > 0) {
					notifyStateChange();
				}
			});
		}
	}

	// Store implementation
	const store: SyncableStore<S> = {
		get state() {
			return asyncState;
		},

		get status() {
			return status;
		},

		set<K extends PermanentKeys<S>>(field: K, value: ExtractPermanent<S[K]>): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const now = clock();
			(internalStorage.data as Record<string, unknown>)[field as string] = value;
			(internalStorage.$timestamps as Record<string, number>)[field as string] = now;

			// Update state
			asyncState = { ...asyncState, data: { ...internalStorage.data } };

			// Emit event
			emit(`${String(field)}:changed`, value);
			notifyStateChange();

			// Save to storage
			saveToStorage(asyncState.account);
		},

		patch<K extends PermanentKeys<S>>(
			field: K,
			value: DeepPartial<ExtractPermanent<S[K]>>,
		): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const now = clock();
			const current = (internalStorage.data as Record<string, unknown>)[field as string];
			const merged = deepMerge(current, value);

			(internalStorage.data as Record<string, unknown>)[field as string] = merged;
			(internalStorage.$timestamps as Record<string, number>)[field as string] = now;

			// Update state
			asyncState = { ...asyncState, data: { ...internalStorage.data } };

			// Emit event
			emit(`${String(field)}:changed`, merged);
			notifyStateChange();

			// Save to storage
			saveToStorage(asyncState.account);
		},

		add<K extends MapKeys<S>>(
			field: K,
			key: string,
			value: ExtractMapItem<S[K]>,
			options: { deleteAt: number },
		): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const now = clock();
			const items = ((internalStorage.data as Record<string, unknown>)[field as string] ?? {}) as Record<
				string,
				unknown
			>;
			const timestamps =
				((internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] ?? {});

			// Create item with deleteAt
			const itemWithDeleteAt = { ...(value as object), deleteAt: options.deleteAt };
			items[key] = itemWithDeleteAt;
			timestamps[key] = now;

			(internalStorage.data as Record<string, unknown>)[field as string] = items;
			(internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] = timestamps;

			// Update state
			asyncState = { ...asyncState, data: { ...internalStorage.data } };

			// Emit event
			emit(`${String(field)}:added`, { key, item: itemWithDeleteAt });
			notifyStateChange();

			// Save to storage
			saveToStorage(asyncState.account);
		},

		update<K extends MapKeys<S>>(field: K, key: string, value: ExtractMapItem<S[K]>): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const items = ((internalStorage.data as Record<string, unknown>)[field as string] ?? {}) as Record<
				string,
				{ deleteAt: number }
			>;
			const existing = items[key];

			if (!existing) {
				throw new Error(`Item ${key} does not exist in ${String(field)}`);
			}

			const now = clock();
			const timestamps =
				((internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] ?? {});

			// Keep existing deleteAt
			const updatedItem = { ...(value as object), deleteAt: existing.deleteAt };
			items[key] = updatedItem;
			timestamps[key] = now;

			(internalStorage.data as Record<string, unknown>)[field as string] = items;
			(internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] = timestamps;

			// Update state
			asyncState = { ...asyncState, data: { ...internalStorage.data } };

			// Emit event
			emit(`${String(field)}:updated`, { key, item: updatedItem });
			notifyStateChange();

			// Save to storage
			saveToStorage(asyncState.account);
		},

		remove<K extends MapKeys<S>>(field: K, key: string): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const items = ((internalStorage.data as Record<string, unknown>)[field as string] ?? {}) as Record<
				string,
				{ deleteAt: number }
			>;
			const existing = items[key];

			if (!existing) {
				return; // Item doesn't exist, nothing to remove
			}

			// Create tombstone with item's deleteAt
			const tombstones =
				((internalStorage.$tombstones as Record<string, Record<string, number>>)[field as string] ?? {});
			tombstones[key] = existing.deleteAt;
			(internalStorage.$tombstones as Record<string, Record<string, number>>)[field as string] = tombstones;

			// Remove from items
			delete items[key];

			// Remove timestamp
			const timestamps =
				((internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] ?? {});
			delete timestamps[key];

			// Update state
			asyncState = { ...asyncState, data: { ...internalStorage.data } };

			// Emit event
			emit(`${String(field)}:removed`, { key, item: existing });
			notifyStateChange();

			// Save to storage
			saveToStorage(asyncState.account);
		},

		subscribe(callback: (state: AsyncState<DataOf<S>>) => void): () => void {
			stateSubscribers.add(callback);
			callback(asyncState);
			return () => {
				stateSubscribers.delete(callback);
			};
		},

		on<E extends string>(event: E, callback: (data: unknown) => void): () => void {
			if (!eventListeners.has(event)) {
				eventListeners.set(event, new Set());
			}
			eventListeners.get(event)!.add(callback);
			return () => {
				eventListeners.get(event)?.delete(callback);
			};
		},

		start(): () => void {
			unsubscribeAccount = accountStore.subscribe((account) => {
				setAccount(account);
			});
			return () => store.stop();
		},

		stop(): void {
			unsubscribeAccount?.();
			unsubscribeAccount = undefined;
			unwatchStorage?.();
			unwatchStorage = undefined;
		},
	};

	// Auto-start by subscribing to account changes
	store.start();

	return store;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Deep merge objects (for patch operation).
 */
function deepMerge<T>(target: T, source: DeepPartial<T>): T {
	if (typeof source !== 'object' || source === null) {
		return source as T;
	}

	if (typeof target !== 'object' || target === null) {
		return source as T;
	}

	const result = { ...target };

	for (const key of Object.keys(source) as (keyof T)[]) {
		const sourceValue = source[key];
		if (sourceValue !== undefined) {
			(result as Record<string, unknown>)[key as string] = deepMerge(
				target[key],
				sourceValue as DeepPartial<T[keyof T]>,
			);
		}
	}

	return result;
}
