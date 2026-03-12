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
	StoreEvents,
	SyncAdapter,
	SyncConfig,
} from './types';
import type { AsyncStorage } from '../storage';
import { cleanup } from './cleanup';
import { mergeStore } from './merge';
import { isWatchable } from '../storage';
import { createEmitter } from 'radiate';

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

	/** Optional: Server sync adapter */
	sync?: SyncAdapter<S>;

	/** Optional: Sync configuration */
	syncConfig?: SyncConfig;
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

	/** Subscribe to type-safe events */
	on<E extends keyof StoreEvents<S>>(
		event: E,
		callback: (data: StoreEvents<S>[E]) => void,
	): () => void;

	/** Unsubscribe from events */
	off<E extends keyof StoreEvents<S>>(
		event: E,
		callback: (data: StoreEvents<S>[E]) => void,
	): void;

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
		sync: syncAdapter,
		syncConfig,
	} = config;

	// Sync configuration with defaults
	const debounceMs = syncConfig?.debounceMs ?? 1000;
	const maxRetries = syncConfig?.maxRetries ?? 3;
	const retryBackoffMs = syncConfig?.retryBackoffMs ?? 1000;

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

	// Type-safe event emitter using radiate
	const emitter = createEmitter<StoreEvents<S>>();

	// State subscribers
	const stateSubscribers = new Set<(state: AsyncState<DataOf<S>>) => void>();

	function notifyStateChange(): void {
		for (const callback of stateSubscribers) {
			callback(asyncState);
		}
		emitter.emit('state', asyncState);
	}

	// Storage watch cleanup
	let unwatchStorage: (() => void) | undefined;

	// Account subscription cleanup
	let unsubscribeAccount: (() => void) | undefined;

	// Sync debounce timer
	let syncDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	let syncDirty = false;

	// Mark dirty and schedule sync
	function markDirty(): void {
		if (!syncAdapter) return;
		syncDirty = true;
		scheduleSyncPush();
	}

	// Schedule a debounced push to server
	function scheduleSyncPush(): void {
		if (!syncAdapter || !asyncState.account) return;

		if (syncDebounceTimer) {
			clearTimeout(syncDebounceTimer);
		}

		syncDebounceTimer = setTimeout(() => {
			performSyncPush();
		}, debounceMs);
	}

	// Perform the actual push to server with retry logic
	async function performSyncPush(retryCount = 0): Promise<void> {
		if (!syncAdapter || !internalStorage || asyncState.status !== 'ready') return;

		const account = asyncState.account;
		syncDirty = false;

		try {
			(status as { syncState: string }).syncState = 'syncing';
			if (retryCount === 0) {
				emitter.emit('sync', { type: 'started' });
			}

			const serverResponse = await syncAdapter.push(account, internalStorage);

			// Merge server response with local state
			const { merged, changes } = mergeStore(internalStorage, serverResponse, schema);
			internalStorage = merged;

			// Update async state data
			asyncState = { ...asyncState, data: merged.data };

			// Emit change events
			for (const change of changes) {
				emitter.emit(change.event as keyof StoreEvents<S>, change.data as StoreEvents<S>[keyof StoreEvents<S>]);
			}

			// Save merged state to local storage
			await storage.save(storageKey(account), internalStorage);

			(status as { lastSyncedAt: number | null }).lastSyncedAt = Date.now();
			(status as { syncError: Error | null }).syncError = null;
			emitter.emit('sync', { type: 'completed', timestamp: Date.now() });
			(status as { syncState: string }).syncState = 'idle';

			if (changes.length > 0) {
				notifyStateChange();
			}
		} catch (error) {
			// Check if we should retry
			if (retryCount < maxRetries) {
				// Schedule retry with exponential backoff
				const backoffDelay = retryBackoffMs * Math.pow(2, retryCount);
				setTimeout(() => {
					performSyncPush(retryCount + 1);
				}, backoffDelay);
			} else {
				// Max retries reached, emit failure
				(status as { syncError: Error | null }).syncError = error as Error;
				emitter.emit('sync', { type: 'failed', error: error as Error });
				(status as { syncState: string }).syncState = 'idle';
			}
		}
	}

	// Pull from server and merge with local state
	async function performSyncPull(account: `0x${string}`): Promise<void> {
		if (!syncAdapter || !internalStorage) return;

		try {
			const serverData = await syncAdapter.pull(account);

			if (serverData) {
				// Merge server data with local state
				const { merged, changes } = mergeStore(internalStorage, serverData, schema);
				internalStorage = merged;

				// Update async state data
				if (asyncState.status === 'ready') {
					asyncState = { ...asyncState, data: merged.data };
				}

				// Emit change events
				for (const change of changes) {
					emitter.emit(change.event as keyof StoreEvents<S>, change.data as StoreEvents<S>[keyof StoreEvents<S>]);
				}

				// Save merged state to local storage
				await storage.save(storageKey(account), internalStorage);

				if (changes.length > 0) {
					notifyStateChange();
				}
			}
		} catch (error) {
			// Pull errors are non-fatal - we continue with local data
			console.warn('Failed to pull from server:', error);
		}
	}

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

		// Pull from server (if sync adapter configured)
		if (syncAdapter) {
			performSyncPull(newAccount);
		}

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
					emitter.emit(change.event as keyof StoreEvents<S>, change.data as StoreEvents<S>[keyof StoreEvents<S>]);
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
			emitter.emit(`${String(field)}:changed` as keyof StoreEvents<S>, value as StoreEvents<S>[keyof StoreEvents<S>]);
			notifyStateChange();

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
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
			emitter.emit(`${String(field)}:changed` as keyof StoreEvents<S>, merged as StoreEvents<S>[keyof StoreEvents<S>]);
			notifyStateChange();

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
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
			emitter.emit(`${String(field)}:added` as keyof StoreEvents<S>, { key, item: itemWithDeleteAt } as StoreEvents<S>[keyof StoreEvents<S>]);
			notifyStateChange();

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
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
			emitter.emit(`${String(field)}:updated` as keyof StoreEvents<S>, { key, item: updatedItem } as StoreEvents<S>[keyof StoreEvents<S>]);
			notifyStateChange();

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
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
			emitter.emit(`${String(field)}:removed` as keyof StoreEvents<S>, { key, item: existing } as StoreEvents<S>[keyof StoreEvents<S>]);
			notifyStateChange();

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
		},

		subscribe(callback: (state: AsyncState<DataOf<S>>) => void): () => void {
			stateSubscribers.add(callback);
			callback(asyncState);
			return () => {
				stateSubscribers.delete(callback);
			};
		},

		on: emitter.on.bind(emitter),
		off: emitter.off.bind(emitter),

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
			// Clear sync debounce timer
			if (syncDebounceTimer) {
				clearTimeout(syncDebounceTimer);
				syncDebounceTimer = undefined;
			}
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
