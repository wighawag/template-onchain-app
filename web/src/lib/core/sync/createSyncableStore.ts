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

// ============================================================================
// Readable Store Interface (Svelte store contract)
// ============================================================================

/**
 * Minimal readable store interface matching Svelte's store contract.
 */
export interface Readable<T> {
	subscribe(callback: (value: T) => void): () => void;
}
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

	/** Migration functions keyed by target version. Old data is passed as unknown type and must be cast appropriately. */
	migrations?: Record<number, (oldData: unknown) => InternalStorage<S>>;
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

	/** Get a reactive store for a specific map item */
	getItemStore<K extends MapKeys<S>>(
		field: K,
		key: string,
	): Readable<(ExtractMapItem<S[K]> & { deleteAt: number }) | undefined>;

	/** Get a reactive store for a top-level field */
	getFieldStore<K extends keyof S>(field: K): Readable<DataOf<S>[K] | undefined>;

	/** Subscribe to status changes (Svelte store contract) */
	readonly statusStore: Readable<StoreStatus>;

	/** Force sync to server now, bypassing debounce */
	syncNow(): Promise<void>;

	/** Pause server sync */
	pauseSync(): void;

	/** Resume server sync */
	resumeSync(): void;
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
		migrations,
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
		hasPendingSync: false,
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

	// Visibility change handler for syncOnVisible
	let handleVisibilityChange: (() => void) | undefined;

	// Online/offline handlers for syncOnReconnect
	let handleOnline: (() => void) | undefined;
	let handleOffline: (() => void) | undefined;

	// Periodic sync interval timer
	let syncIntervalTimer: ReturnType<typeof setInterval> | undefined;

	// Sync debounce timer
	let syncDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	let syncDirty = false;
	let syncPaused = false;

	// Item store cache for fine-grained reactivity
	const itemStoreCache = new Map<string, Readable<unknown>>();

	// Field store cache for field-level reactivity
	const fieldStoreCache = new Map<string, Readable<unknown>>();

	// Status subscribers for reactive status store
	const statusSubscribers = new Set<(status: StoreStatus) => void>();

	function notifyStatusChange(): void {
		for (const callback of statusSubscribers) {
			callback(status);
		}
	}

	// Status store for reactive binding
	const statusStore: Readable<StoreStatus> = {
		subscribe(callback: (status: StoreStatus) => void): () => void {
			statusSubscribers.add(callback);
			callback(status);
			return () => {
				statusSubscribers.delete(callback);
			};
		},
	};

	// Mark dirty and schedule sync
	function markDirty(): void {
		if (!syncAdapter) return;
		syncDirty = true;
		(status as { hasPendingSync: boolean }).hasPendingSync = true;
		notifyStatusChange();
		scheduleSyncPush();
	}

	// Schedule a debounced push to server
	function scheduleSyncPush(): void {
		if (!syncAdapter || !asyncState.account || syncPaused) return;

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
			notifyStatusChange();
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
			(status as { hasPendingSync: boolean }).hasPendingSync = false;
			emitter.emit('sync', { type: 'completed', timestamp: Date.now() });
			(status as { syncState: string }).syncState = 'idle';
			notifyStatusChange();

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
				notifyStatusChange();
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
			notifyStatusChange();

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
			notifyStatusChange();
		}
	}

	// Set account (internal)
	async function setAccount(newAccount: `0x${string}` | undefined): Promise<void> {
		// Same account - no change
		if (newAccount === asyncState.account) return;

		// Clean up previous watch
		unwatchStorage?.();
		unwatchStorage = undefined;

		// Clear item store cache on account switch
		itemStoreCache.clear();

		// Clear field store cache on account switch
		fieldStoreCache.clear();

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

		if (localData) {
			const storedVersion = localData.$version ?? 0;

			if (storedVersion < schemaVersion) {
				// Run migrations sequentially
				let migrated: unknown = localData;
				try {
					for (let v = storedVersion + 1; v <= schemaVersion; v++) {
						const migration = migrations?.[v];
						if (!migration) {
							throw new Error(`Missing migration for version ${v}`);
						}
						migrated = migration(migrated);
						(migrated as { $version: number }).$version = v;
					}
					internalStorage = migrated as InternalStorage<S>;
				} catch (error) {
					// Migration failed - store error and stay in loading state
					(status as { storageError: Error | null }).storageError = error as Error;
					notifyStatusChange();
					// Don't proceed to ready state - leave in loading state
					return;
				}
			} else {
				internalStorage = localData;
			}
		} else {
			internalStorage = createDefaultInternalStorage();
		}

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

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(`${String(field)}:changed` as keyof StoreEvents<S>, value as StoreEvents<S>[keyof StoreEvents<S>]);

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

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(`${String(field)}:changed` as keyof StoreEvents<S>, merged as StoreEvents<S>[keyof StoreEvents<S>]);

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

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(`${String(field)}:added` as keyof StoreEvents<S>, { key, item: itemWithDeleteAt } as StoreEvents<S>[keyof StoreEvents<S>]);

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

			// Emit event (for item-level subscribers, NOT main subscribe)
			emitter.emit(`${String(field)}:updated` as keyof StoreEvents<S>, { key, item: updatedItem } as StoreEvents<S>[keyof StoreEvents<S>]);

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

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(`${String(field)}:removed` as keyof StoreEvents<S>, { key, item: existing } as StoreEvents<S>[keyof StoreEvents<S>]);

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

		statusStore,

		start(): () => void {
			unsubscribeAccount = accountStore.subscribe((account) => {
				setAccount(account);
			});

			// Set up visibility change listener for syncOnVisible
			if (syncConfig?.syncOnVisible !== false && typeof document !== 'undefined') {
				handleVisibilityChange = () => {
					if (document.visibilityState === 'visible' && asyncState.status === 'ready') {
						performSyncPull(asyncState.account);
					}
				};
				document.addEventListener('visibilitychange', handleVisibilityChange);
			}

			// Set up online/offline listeners for syncOnReconnect
			if (syncConfig?.syncOnReconnect !== false && typeof window !== 'undefined') {
				handleOnline = () => {
					(status as { syncState: string }).syncState = 'idle';
					notifyStatusChange();
					if (asyncState.status === 'ready') {
						performSyncPush();
					}
				};
				handleOffline = () => {
					(status as { syncState: string }).syncState = 'offline';
					notifyStatusChange();
				};
				window.addEventListener('online', handleOnline);
				window.addEventListener('offline', handleOffline);
			}

			// Set up periodic sync interval
			const intervalMs = syncConfig?.intervalMs;
			if (syncAdapter && intervalMs && intervalMs > 0) {
				syncIntervalTimer = setInterval(() => {
					if (asyncState.status === 'ready' && !syncPaused) {
						performSyncPull(asyncState.account);
					}
				}, intervalMs);
			}

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
			// Clean up visibility change listener
			if (handleVisibilityChange) {
				document.removeEventListener('visibilitychange', handleVisibilityChange);
				handleVisibilityChange = undefined;
			}
			// Clean up online/offline listeners
			if (handleOnline) {
				window.removeEventListener('online', handleOnline);
				handleOnline = undefined;
			}
			if (handleOffline) {
				window.removeEventListener('offline', handleOffline);
				handleOffline = undefined;
			}
			// Clean up periodic sync interval
			if (syncIntervalTimer) {
				clearInterval(syncIntervalTimer);
				syncIntervalTimer = undefined;
			}
		},

		getItemStore<K extends MapKeys<S>>(
			field: K,
			key: string,
		): Readable<(ExtractMapItem<S[K]> & { deleteAt: number }) | undefined> {
			type ItemType = (ExtractMapItem<S[K]> & { deleteAt: number }) | undefined;

			// Check cache first
			const cacheKey = `${String(field)}:${key}`;
			const cached = itemStoreCache.get(cacheKey);
			if (cached) return cached as Readable<ItemType>;

			const getCurrentValue = (): ItemType => {
				if (asyncState.status !== 'ready') return undefined;
				const items = (asyncState.data[field] as Record<string, unknown>) ?? {};
				return items[key] as ItemType;
			};

			const itemStore: Readable<ItemType> = {
				subscribe(callback: (value: ItemType) => void): () => void {
					callback(getCurrentValue());

					// Subscribe to state changes for initial load
					const unsubState = emitter.on('state', () => callback(getCurrentValue()));

					// Subscribe to field-specific events
					const unsubAdded = emitter.on(`${String(field)}:added` as keyof StoreEvents<S>, (e) => {
						const event = e as { key: string; item: unknown };
						if (event.key === key) callback(event.item as ItemType);
					});
					const unsubUpdated = emitter.on(`${String(field)}:updated` as keyof StoreEvents<S>, (e) => {
						const event = e as { key: string; item: unknown };
						if (event.key === key) callback(event.item as ItemType);
					});
					const unsubRemoved = emitter.on(`${String(field)}:removed` as keyof StoreEvents<S>, (e) => {
						const event = e as { key: string };
						if (event.key === key) callback(undefined);
					});

					return () => {
						unsubState();
						unsubAdded();
						unsubUpdated();
						unsubRemoved();
					};
				},
			};

			// Cache the store
			itemStoreCache.set(cacheKey, itemStore);
			return itemStore;
		},

		getFieldStore<K extends keyof S>(field: K): Readable<DataOf<S>[K] | undefined> {
			type FieldType = DataOf<S>[K] | undefined;

			// Check cache first
			const cacheKey = String(field);
			const cached = fieldStoreCache.get(cacheKey);
			if (cached) return cached as Readable<FieldType>;

			const getCurrentValue = (): FieldType => {
				if (asyncState.status !== 'ready') return undefined;
				return asyncState.data[field];
			};

			// Determine if this is a map field or permanent field
			const fieldDef = schema[field];
			const isMap = fieldDef.__type === 'map';

			const fieldStore: Readable<FieldType> = {
				subscribe(callback: (value: FieldType) => void): () => void {
					callback(getCurrentValue());

					// Subscribe to state changes for initial load
					const unsubState = emitter.on('state', () => callback(getCurrentValue()));

					// For permanent fields: listen to :changed events
					// For map fields: listen to :added and :removed events (NOT :updated)
					const unsubs: (() => void)[] = [unsubState];

					if (isMap) {
						unsubs.push(
							emitter.on(`${String(field)}:added` as keyof StoreEvents<S>, () => {
								callback(getCurrentValue());
							}),
						);
						unsubs.push(
							emitter.on(`${String(field)}:removed` as keyof StoreEvents<S>, () => {
								callback(getCurrentValue());
							}),
						);
						// Intentionally NOT listening to :updated - use getItemStore for that
					} else {
						unsubs.push(
							emitter.on(`${String(field)}:changed` as keyof StoreEvents<S>, () => {
								callback(getCurrentValue());
							}),
						);
					}

					return () => {
						for (const unsub of unsubs) {
							unsub();
						}
					};
				},
			};

			// Cache the store
			fieldStoreCache.set(cacheKey, fieldStore);
			return fieldStore;
		},

		async syncNow(): Promise<void> {
			if (!syncAdapter || asyncState.status !== 'ready') return;

			// Clear any pending debounce
			if (syncDebounceTimer) {
				clearTimeout(syncDebounceTimer);
				syncDebounceTimer = undefined;
			}

			await performSyncPush();
		},

		pauseSync(): void {
			syncPaused = true;
			if (syncDebounceTimer) {
				clearTimeout(syncDebounceTimer);
				syncDebounceTimer = undefined;
			}
		},

		resumeSync(): void {
			syncPaused = false;
			if (syncDirty) {
				scheduleSyncPush();
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
