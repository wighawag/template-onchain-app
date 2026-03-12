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
	SyncStatus,
	StorageStatus,
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
import type {AsyncStorage} from '../storage';
import {cleanup} from './cleanup';
import {mergeAndCleanup} from './merge';
import {isWatchable} from '../storage';
import {createEmitter} from 'radiate';

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

	/** Set a permanent field value */
	set<K extends PermanentKeys<S>>(
		field: K,
		value: ExtractPermanent<S[K]>,
	): void;

	/** Patch a permanent field with partial updates */
	patch<K extends PermanentKeys<S>>(
		field: K,
		value: DeepPartial<ExtractPermanent<S[K]>>,
	): void;

	/** Add an item to a map field */
	add<K extends MapKeys<S>>(
		field: K,
		key: string,
		value: ExtractMapItem<S[K]>,
		options: {deleteAt: number},
	): void;

	/** Update an existing map item. Throws if item does not exist. */
	update<K extends MapKeys<S>>(
		field: K,
		key: string,
		value: ExtractMapItem<S[K]>,
	): void;

	/** Remove an item from a map field. Throws if item does not exist. */
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
	): Readable<(ExtractMapItem<S[K]> & {deleteAt: number}) | undefined>;

	/** Get a reactive store for a top-level field */
	getFieldStore<K extends keyof S>(
		field: K,
	): Readable<DataOf<S>[K] | undefined>;

	/** Subscribe to sync status changes */
	readonly syncStatusStore: Readable<SyncStatus>;

	/** Subscribe to storage status changes */
	readonly storageStatusStore: Readable<StorageStatus>;

	/** Force sync to server now, bypassing debounce */
	syncNow(): Promise<void>;

	/** Pause server sync */
	pauseSync(): void;

	/** Resume server sync */
	resumeSync(): void;

	/** Retry loading account data after a migration failure */
	retryLoad(): void;

	/** Wait for all pending storage saves to complete
	 * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
	 * @throws Error if timeout is reached while saves are still pending
	 */
	flush(timeoutMs?: number): Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a syncable store.
 *
 * **IMPORTANT**: You must call `store.start()` after creation to begin
 * watching account changes. This allows you to set up event listeners
 * before the store starts reacting to account changes.
 *
 * @example
 * ```typescript
 * const store = createSyncableStore(config);
 *
 * // Set up event listeners first
 * store.on('$store:sync', (event) => console.log(event));
 *
 * // Then start watching account changes
 * store.start();
 * ```
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
	let asyncState: AsyncState<DataOf<S>> = {status: 'idle', account: undefined};
	let internalStorage: InternalStorage<S> | null = null;
	let loadGeneration = 0;

	// Internal mutable sync status type
	interface MutableSyncStatus {
		isSyncing: boolean;
		isOnline: boolean;
		isPaused: boolean;
		hasPendingSync: boolean;
		lastSyncedAt: number | null;
		syncError: Error | null;
		readonly displayState: 'syncing' | 'offline' | 'paused' | 'error' | 'idle';
	}

	// Internal mutable storage status type
	interface MutableStorageStatus {
		pendingSaves: number;
		lastSavedAt: number | null;
		storageError: Error | null;
		readonly displayState: 'saving' | 'error' | 'idle';
	}

	// Mutable sync status (readonly externally via SyncStatus type)
	const mutableSyncStatus: MutableSyncStatus = {
		isSyncing: false,
		isOnline: true, // Assume online until proven otherwise
		isPaused: false,
		hasPendingSync: false,
		lastSyncedAt: null,
		syncError: null,
		get displayState() {
			if (this.isSyncing) return 'syncing';
			if (!this.isOnline) return 'offline';
			if (this.isPaused) return 'paused';
			if (this.syncError) return 'error';
			return 'idle';
		},
	};

	// Mutable storage status (readonly externally via StorageStatus type)
	const mutableStorageStatus: MutableStorageStatus = {
		pendingSaves: 0,
		lastSavedAt: null,
		storageError: null,
		get displayState() {
			if (this.pendingSaves > 0) return 'saving';
			if (this.storageError) return 'error';
			return 'idle';
		},
	};

	// Public readonly views
	const syncStatus: SyncStatus = mutableSyncStatus;
	const storageStatus: StorageStatus = mutableStorageStatus;

	// Type-safe event emitter using radiate
	const emitter = createEmitter<StoreEvents<S>>();

	// Type definitions for event helper functions
	type SyncEventData =
		| {type: 'pending'}
		| {type: 'started'}
		| {type: 'completed'; timestamp: number}
		| {type: 'failed'; error: Error}
		| {type: 'offline'}
		| {type: 'online'}
		| {type: 'paused'}
		| {type: 'resumed'};

	type StorageEventData =
		| {type: 'saving'}
		| {type: 'saved'; timestamp: number}
		| {type: 'failed'; error: Error};

	type StateEventData = {type: 'idle'} | {type: 'loading'} | {type: 'ready'};

	// Helper to emit sync events (works around TypeScript generic intersection issues)
	function emitSyncEvent(event: SyncEventData): void {
		(emitter.emit as (eventName: '$store:sync', data: SyncEventData) => void)(
			'$store:sync',
			event,
		);
	}

	// Helper to emit storage events (works around TypeScript generic intersection issues)
	function emitStorageEvent(event: StorageEventData): void {
		(
			emitter.emit as (
				eventName: '$store:storage',
				data: StorageEventData,
			) => void
		)('$store:storage', event);
	}

	// Helper to emit state events (works around TypeScript generic intersection issues)
	function emitStateEvent(event: StateEventData): void {
		(emitter.emit as (eventName: '$store:state', data: StateEventData) => void)(
			'$store:state',
			event,
		);
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

	// Beforeunload handler for flushing pending saves
	let handleBeforeUnload: ((e: BeforeUnloadEvent) => void) | undefined;

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

	// Sync status store for reactive binding
	const syncStatusStore: Readable<SyncStatus> = {
		subscribe(callback: (status: SyncStatus) => void): () => void {
			callback(syncStatus);
			return emitter.on('$store:sync', () => callback(syncStatus));
		},
	};

	// Storage status store for reactive binding
	const storageStatusStore: Readable<StorageStatus> = {
		subscribe(callback: (status: StorageStatus) => void): () => void {
			callback(storageStatus);
			return emitter.on('$store:storage', () => callback(storageStatus));
		},
	};

	// Mark dirty and schedule sync
	function markDirty(): void {
		if (!syncAdapter) return;
		syncDirty = true;
		mutableSyncStatus.hasPendingSync = true;
		emitSyncEvent({type: 'pending'});
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

	// Perform the actual sync: pull → merge → save → push
	// This implements client-side merging for a "dumb" server that only stores/retrieves data
	async function performSyncPush(retryCount = 0): Promise<void> {
		if (!syncAdapter || !internalStorage || asyncState.status !== 'ready')
			return;

		const account = asyncState.account;
		// Note: syncDirty is cleared only on successful completion to avoid losing
		// mutations that occur during retry attempts

		try {
			mutableSyncStatus.isSyncing = true;
			mutableSyncStatus.syncError = null; // Clear previous error when starting new sync
			if (retryCount === 0) {
				emitSyncEvent({type: 'started'});
			}

			// Step 1: Pull latest from server
			const pullResponse = await syncAdapter.pull(account);

			// Step 2: Merge server data with local data (if server has data)
			let dataToSync = internalStorage;
			if (pullResponse.data) {
				const {storage: cleanedMerged, changes} = mergeAndCleanup(
					internalStorage,
					pullResponse.data,
					schema,
					clock(),
				);
				dataToSync = cleanedMerged;

				// Update local state if there were any changes (from merge or cleanup)
				if (changes.length > 0) {
					internalStorage = cleanedMerged;
					asyncState = {...asyncState, data: cleanedMerged.data};

					// Emit change events for any server-side updates
					// NOTE: We do NOT call notifyStateChange() here - field-level events are sufficient
					// Main subscribe() should only trigger on state transitions (idle/loading/ready)
					for (const change of changes) {
						emitter.emit(
							change.event as keyof StoreEvents<S>,
							change.data as StoreEvents<S>[keyof StoreEvents<S>],
						);
					}

					// Step 3: Save merged state to local storage
					await storage.save(storageKey(account), cleanedMerged);
				}
			}

			// Step 4: Push merged data to server with new counter
			// Use max(clock, pullCounter + 1) to ensure monotonically increasing counters
			// even for sub-millisecond operations
			// Use BigInt arithmetic throughout to avoid precision loss for large counters
			const clockBigInt = BigInt(clock());
			const newCounter =
				clockBigInt > pullResponse.counter
					? clockBigInt
					: pullResponse.counter + 1n;
			const pushResponse = await syncAdapter.push(
				account,
				dataToSync,
				newCounter,
			);

			if (pushResponse.success) {
				syncDirty = false; // Clear dirty flag only on successful sync
				mutableSyncStatus.lastSyncedAt = clock();
				mutableSyncStatus.syncError = null;
				mutableSyncStatus.hasPendingSync = false;
				mutableSyncStatus.isSyncing = false;
				emitSyncEvent({type: 'completed', timestamp: clock()});
			} else {
				// Push was rejected - counter was stale
				// This means another client pushed between our pull and push
				// Retry the entire flow
				if (retryCount < maxRetries) {
					const backoffDelay = retryBackoffMs * Math.pow(2, retryCount);
					setTimeout(() => {
						performSyncPush(retryCount + 1);
					}, backoffDelay);
				} else {
					throw new Error(
						pushResponse.error ||
							'Push rejected: counter stale after max retries',
					);
				}
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
				mutableSyncStatus.syncError = error as Error;
				mutableSyncStatus.isSyncing = false;
				emitSyncEvent({type: 'failed', error: error as Error});
			}
		}
	}

	// Pull from server and merge with local state
	async function performSyncPull(account: `0x${string}`): Promise<void> {
		if (!syncAdapter || !internalStorage) return;

		try {
			const pullResponse = await syncAdapter.pull(account);

			if (pullResponse.data) {
				// Merge server data with local state and cleanup expired items
				const {storage: cleanedMerged, changes} = mergeAndCleanup(
					internalStorage,
					pullResponse.data,
					schema,
					clock(),
				);

				if (changes.length > 0) {
					internalStorage = cleanedMerged;

					// Update async state data
					if (asyncState.status === 'ready') {
						asyncState = {...asyncState, data: cleanedMerged.data};
					}

					// Emit field-level change events - no notifyStateChange() needed
					// Main subscribe() should only trigger on state transitions
					for (const change of changes) {
						emitter.emit(
							change.event as keyof StoreEvents<S>,
							change.data as StoreEvents<S>[keyof StoreEvents<S>],
						);
					}

					// Save merged state to local storage
					try {
						await storage.save(storageKey(account), cleanedMerged);
					} catch (saveError) {
						// Storage save errors during pull are non-fatal but should be logged
						console.warn('Failed to save merged state to storage:', saveError);
					}
				}
			}
		} catch (error) {
			// Pull errors are non-fatal - we continue with local data
			// Emit sync failed event so consumers can react to repeated failures
			console.warn('Failed to pull from server:', error);
			emitter.emit('$store:sync', {type: 'failed', error: error as Error});
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

		mutableStorageStatus.pendingSaves++;
		mutableStorageStatus.storageError = null; // Clear previous error when starting new save
		emitStorageEvent({type: 'saving'});

		try {
			await storage.save(storageKey(account), internalStorage);

			mutableStorageStatus.pendingSaves--;
			mutableStorageStatus.lastSavedAt = clock();
			emitStorageEvent({type: 'saved', timestamp: clock()});
		} catch (error) {
			mutableStorageStatus.pendingSaves--;
			mutableStorageStatus.storageError = error as Error;
			emitStorageEvent({type: 'failed', error: error as Error});
		}
	}

	// Set account (internal)
	async function setAccount(
		newAccount: `0x${string}` | undefined,
	): Promise<void> {
		// Same account - no change
		if (newAccount === asyncState.account) return;

		// Clean up previous watch
		unwatchStorage?.();
		unwatchStorage = undefined;

		// Clear item store cache on account switch
		itemStoreCache.clear();

		// Clear field store cache on account switch
		fieldStoreCache.clear();

		// No account - transition to idle
		if (!newAccount) {
			asyncState = {status: 'idle', account: undefined};
			internalStorage = null;
			emitStateEvent({type: 'idle'});
			return;
		}

		// Transition to loading state
		asyncState = {status: 'loading', account: newAccount};
		emitStateEvent({type: 'loading'});

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
						(migrated as {$version: number}).$version = v;
					}
					internalStorage = migrated as InternalStorage<S>;
				} catch (error) {
					// Migration failed - store error and stay in loading state
					mutableStorageStatus.storageError = error as Error;
					emitStorageEvent({type: 'failed', error: error as Error});
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
		// Note: We ignore changes here because the store isn't ready yet.
		// Subscribers haven't seen these items, so no need to emit :removed events.
		const {storage: cleanedStorage} = cleanup(internalStorage, schema, clock());
		internalStorage = cleanedStorage;

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
		emitStateEvent({type: 'ready'});

		// Pull from server (if sync adapter configured)
		if (syncAdapter) {
			performSyncPull(newAccount);
		}

		// Set up storage watch for cross-tab sync
		if (isWatchable(storage)) {
			unwatchStorage = storage.watch(
				storageKey(newAccount),
				async (_, newValue) => {
					if (!newValue || !internalStorage) return;

					// Merge with current state and cleanup expired items
					const {storage: cleanedMerged, changes} = mergeAndCleanup(
						internalStorage,
						newValue,
						schema,
						clock(),
					);

					if (changes.length > 0) {
						internalStorage = cleanedMerged;

						// Update async state data
						if (asyncState.status === 'ready') {
							asyncState = {...asyncState, data: cleanedMerged.data};
						}

						// Emit field-level change events - no notifyStateChange() needed
						// Main subscribe() should only trigger on state transitions
						for (const change of changes) {
							emitter.emit(
								change.event as keyof StoreEvents<S>,
								change.data as StoreEvents<S>[keyof StoreEvents<S>],
							);
						}
					}
				},
			);
		}
	}

	// Store implementation
	const store: SyncableStore<S> = {
		get state() {
			return asyncState;
		},

		set<K extends PermanentKeys<S>>(
			field: K,
			value: ExtractPermanent<S[K]>,
		): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const now = clock();
			(internalStorage.data as Record<string, unknown>)[field as string] =
				value;
			(internalStorage.$timestamps as Record<string, number>)[field as string] =
				now;

			// Update state
			asyncState = {...asyncState, data: {...internalStorage.data}};

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(
				`${String(field)}:changed` as keyof StoreEvents<S>,
				value as StoreEvents<S>[keyof StoreEvents<S>],
			);

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
			const current = (internalStorage.data as Record<string, unknown>)[
				field as string
			];
			const merged = deepMerge(current, value);

			(internalStorage.data as Record<string, unknown>)[field as string] =
				merged;
			(internalStorage.$timestamps as Record<string, number>)[field as string] =
				now;

			// Update state
			asyncState = {...asyncState, data: {...internalStorage.data}};

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(
				`${String(field)}:changed` as keyof StoreEvents<S>,
				merged as StoreEvents<S>[keyof StoreEvents<S>],
			);

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
		},

		add<K extends MapKeys<S>>(
			field: K,
			key: string,
			value: ExtractMapItem<S[K]>,
			options: {deleteAt: number},
		): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const now = clock();
			const items = ((internalStorage.data as Record<string, unknown>)[
				field as string
			] ?? {}) as Record<string, unknown>;
			const timestamps =
				(
					internalStorage.$itemTimestamps as Record<
						string,
						Record<string, number>
					>
				)[field as string] ?? {};

			// Create item with deleteAt
			const itemWithDeleteAt = {
				...(value as object),
				deleteAt: options.deleteAt,
			};
			items[key] = itemWithDeleteAt;
			timestamps[key] = now;

			(internalStorage.data as Record<string, unknown>)[field as string] =
				items;
			(
				internalStorage.$itemTimestamps as Record<
					string,
					Record<string, number>
				>
			)[field as string] = timestamps;

			// Update state
			asyncState = {...asyncState, data: {...internalStorage.data}};

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(
				`${String(field)}:added` as keyof StoreEvents<S>,
				{key, item: itemWithDeleteAt} as StoreEvents<S>[keyof StoreEvents<S>],
			);

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
		},

		update<K extends MapKeys<S>>(
			field: K,
			key: string,
			value: ExtractMapItem<S[K]>,
		): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const items = ((internalStorage.data as Record<string, unknown>)[
				field as string
			] ?? {}) as Record<string, {deleteAt: number}>;
			const existing = items[key];

			if (!existing) {
				throw new Error(`Item ${key} does not exist in ${String(field)}`);
			}

			const now = clock();
			const timestamps =
				(
					internalStorage.$itemTimestamps as Record<
						string,
						Record<string, number>
					>
				)[field as string] ?? {};

			// Keep existing deleteAt
			const updatedItem = {...(value as object), deleteAt: existing.deleteAt};
			items[key] = updatedItem;
			timestamps[key] = now;

			(internalStorage.data as Record<string, unknown>)[field as string] =
				items;
			(
				internalStorage.$itemTimestamps as Record<
					string,
					Record<string, number>
				>
			)[field as string] = timestamps;

			// Update state
			asyncState = {...asyncState, data: {...internalStorage.data}};

			// Emit event (for item-level subscribers, NOT main subscribe)
			emitter.emit(
				`${String(field)}:updated` as keyof StoreEvents<S>,
				{key, item: updatedItem} as StoreEvents<S>[keyof StoreEvents<S>],
			);

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
		},

		remove<K extends MapKeys<S>>(field: K, key: string): void {
			if (asyncState.status !== 'ready' || !internalStorage) {
				throw new Error('Store is not ready');
			}

			const items = ((internalStorage.data as Record<string, unknown>)[
				field as string
			] ?? {}) as Record<string, {deleteAt: number}>;
			const existing = items[key];

			if (!existing) {
				throw new Error(`Item ${key} does not exist in ${String(field)}`);
			}

			// Create tombstone with item's deleteAt
			const tombstones =
				(internalStorage.$tombstones as Record<string, Record<string, number>>)[
					field as string
				] ?? {};
			tombstones[key] = existing.deleteAt;
			(internalStorage.$tombstones as Record<string, Record<string, number>>)[
				field as string
			] = tombstones;

			// Remove from items
			delete items[key];

			// Remove timestamp
			const timestamps =
				(
					internalStorage.$itemTimestamps as Record<
						string,
						Record<string, number>
					>
				)[field as string] ?? {};
			delete timestamps[key];

			// Update state
			asyncState = {...asyncState, data: {...internalStorage.data}};

			// Emit event (for field-level subscribers, NOT main subscribe)
			emitter.emit(
				`${String(field)}:removed` as keyof StoreEvents<S>,
				{key, item: existing} as StoreEvents<S>[keyof StoreEvents<S>],
			);

			// Save to storage and mark for sync
			saveToStorage(asyncState.account);
			markDirty();
		},

		subscribe(callback: (state: AsyncState<DataOf<S>>) => void): () => void {
			callback(asyncState);
			return emitter.on('$store:state', () => callback(asyncState));
		},

		on: emitter.on.bind(emitter),
		off: emitter.off.bind(emitter),

		syncStatusStore,
		storageStatusStore,

		start(): () => void {
			unsubscribeAccount = accountStore.subscribe((account) => {
				setAccount(account);
			});

			// Set up visibility change listener for syncOnVisible
			if (
				syncConfig?.syncOnVisible !== false &&
				typeof document !== 'undefined'
			) {
				handleVisibilityChange = () => {
					if (
						document.visibilityState === 'visible' &&
						asyncState.status === 'ready'
					) {
						performSyncPull(asyncState.account);
					}
				};
				document.addEventListener('visibilitychange', handleVisibilityChange);
			}

			// Set up online/offline listeners for syncOnReconnect
			if (
				syncConfig?.syncOnReconnect !== false &&
				typeof window !== 'undefined'
			) {
				handleOnline = () => {
					mutableSyncStatus.isOnline = true;
					emitSyncEvent({type: 'online'});
					if (asyncState.status === 'ready') {
						performSyncPush();
					}
				};
				handleOffline = () => {
					mutableSyncStatus.isOnline = false;
					emitSyncEvent({type: 'offline'});
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

			// Set up beforeunload listener to warn about pending saves or unsynced changes
			if (typeof window !== 'undefined') {
				handleBeforeUnload = (e: BeforeUnloadEvent) => {
					if (
						mutableStorageStatus.pendingSaves > 0 ||
						mutableSyncStatus.hasPendingSync
					) {
						// Attempt to prevent close and warn user about pending saves or unsynced changes
						e.preventDefault();
						// Note: Most modern browsers ignore custom messages and show a generic one
						e.returnValue =
							'You have unsaved changes. Are you sure you want to leave?';
					}
				};
				window.addEventListener('beforeunload', handleBeforeUnload);
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
				document.removeEventListener(
					'visibilitychange',
					handleVisibilityChange,
				);
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
			// Clean up beforeunload listener
			if (handleBeforeUnload) {
				window.removeEventListener('beforeunload', handleBeforeUnload);
				handleBeforeUnload = undefined;
			}
		},

		getItemStore<K extends MapKeys<S>>(
			field: K,
			key: string,
		): Readable<(ExtractMapItem<S[K]> & {deleteAt: number}) | undefined> {
			type ItemType = (ExtractMapItem<S[K]> & {deleteAt: number}) | undefined;

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
					const unsubState = emitter.on('$store:state', () =>
						callback(getCurrentValue()),
					);

					// Subscribe to field-specific events
					const unsubAdded = emitter.on(
						`${String(field)}:added` as keyof StoreEvents<S>,
						(e) => {
							const event = e as {key: string; item: unknown};
							if (event.key === key) callback(event.item as ItemType);
						},
					);
					const unsubUpdated = emitter.on(
						`${String(field)}:updated` as keyof StoreEvents<S>,
						(e) => {
							const event = e as {key: string; item: unknown};
							if (event.key === key) callback(event.item as ItemType);
						},
					);
					const unsubRemoved = emitter.on(
						`${String(field)}:removed` as keyof StoreEvents<S>,
						(e) => {
							const event = e as {key: string};
							if (event.key === key) callback(undefined);
						},
					);

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

		getFieldStore<K extends keyof S>(
			field: K,
		): Readable<DataOf<S>[K] | undefined> {
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
					const unsubState = emitter.on('$store:state', () =>
						callback(getCurrentValue()),
					);

					// For permanent fields: listen to :changed events
					// For map fields: listen to :added and :removed events (NOT :updated)
					const unsubs: (() => void)[] = [unsubState];

					if (isMap) {
						unsubs.push(
							emitter.on(
								`${String(field)}:added` as keyof StoreEvents<S>,
								() => {
									callback(getCurrentValue());
								},
							),
						);
						unsubs.push(
							emitter.on(
								`${String(field)}:removed` as keyof StoreEvents<S>,
								() => {
									callback(getCurrentValue());
								},
							),
						);
						// Intentionally NOT listening to :updated - use getItemStore for that
					} else {
						unsubs.push(
							emitter.on(
								`${String(field)}:changed` as keyof StoreEvents<S>,
								() => {
									callback(getCurrentValue());
								},
							),
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
			mutableSyncStatus.isPaused = true;
			if (syncDebounceTimer) {
				clearTimeout(syncDebounceTimer);
				syncDebounceTimer = undefined;
			}
			emitSyncEvent({type: 'paused'});
		},

		resumeSync(): void {
			syncPaused = false;
			mutableSyncStatus.isPaused = false;
			emitSyncEvent({type: 'resumed'});
			if (syncDirty) {
				scheduleSyncPush();
			}
		},

		retryLoad(): void {
			// Only retry if we're in loading state with an error (e.g., migration failure)
			if (asyncState.status !== 'loading' || !asyncState.account) {
				return;
			}

			// Clear the error
			mutableStorageStatus.storageError = null;
			emitStorageEvent({type: 'saved', timestamp: clock()});

			// Re-trigger account load
			const account = asyncState.account;
			// Reset state to trigger fresh load
			asyncState = {status: 'idle', account: undefined};
			setAccount(account);
		},

		async flush(timeoutMs = 30000): Promise<void> {
			// Wait for all pending storage saves to complete with timeout
			const startTime = clock();
			while (mutableStorageStatus.pendingSaves > 0) {
				if (clock() - startTime > timeoutMs) {
					throw new Error(
						`flush() timed out after ${timeoutMs}ms waiting for ${mutableStorageStatus.pendingSaves} pending saves`,
					);
				}
				await new Promise((r) => setTimeout(r, 10));
			}
		},
	};

	return store;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Deep merge objects (for patch operation).
 * Arrays are replaced rather than merged by index to avoid unexpected behavior.
 */
function deepMerge<T>(target: T, source: DeepPartial<T>): T {
	if (typeof source !== 'object' || source === null) {
		return source as T;
	}

	// Arrays should be replaced, not merged by index
	if (Array.isArray(source)) {
		return source as T;
	}

	if (typeof target !== 'object' || target === null || Array.isArray(target)) {
		return source as T;
	}

	const result = {...target};

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
