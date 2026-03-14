# Phase 2: Account Handler Implementation

## Overview

Create `accountHandler.ts` that implements the `AccountHandler` interface. This extracts most of the current `createSyncableStore` logic into a per-account context.

## File Location

`web/src/lib/core/sync/accountHandler.ts`

## Implementation Structure

```typescript
import type {
  Schema,
  InternalStorage,
  DataOf,
  AccountHandler,
  AccountHandlerConfig,
  AccountAsyncState,
  SyncStatus,
  StorageStatus,
  StoreEvents,
  PermanentKeys,
  MapKeys,
  ExtractPermanent,
  ExtractMapItem,
  DeepPartial,
} from './types';
import type {Readable} from './createSyncableStore';
import {createEmitter} from 'radiate';
import {cleanup} from './cleanup';
import {mergeAndCleanup} from './merge';
import {isWatchable} from '../storage';

/**
 * Create an account handler.
 * Each handler is fully isolated and manages a single account's data.
 */
export function createAccountHandler<S extends Schema>(
  account: `0x${string}`,
  config: AccountHandlerConfig<S>,
): AccountHandler<S> {
  // ============ Configuration ============
  const {
    schema,
    storage,
    storageKey,
    defaultData,
    clock,
    schemaVersion,
    migrations,
    syncAdapter,
    syncConfig,
    isCurrentHandler,
  } = config;

  const debounceMs = syncConfig?.debounceMs ?? 1000;
  const maxRetries = syncConfig?.maxRetries ?? 3;
  const retryBackoffMs = syncConfig?.retryBackoffMs ?? 1000;

  // ============ State ============
  let asyncState: AccountAsyncState<DataOf<S>> = {status: 'loading'};
  let internalStorage: InternalStorage<S> | null = null;

  // ============ Storage Queue ============
  let storageSavePending: InternalStorage<S> | null = null;
  let currentSavePromise: Promise<void> | null = null;

  // ============ Sync State ============
  let syncDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let syncDirty = false;
  let syncPaused = false;

  // ============ Status Objects ============
  // Each handler has its own isolated status
  const mutableSyncStatus = createMutableSyncStatus();
  const mutableStorageStatus = createMutableStorageStatus();

  // ============ Event Emitter ============
  const emitter = createEmitter<StoreEvents<S>>();

  // ============ Watchers ============
  let unwatchStorage: (() => void) | undefined;

  // ============ Background Mutation Behavior ============
  let backgroundMutationBehavior: 'allow' | 'warn' | 'throw' = 'allow';

  // ============ Item/Field Store Caches ============
  const itemStoreCache = new Map<string, Readable<unknown>>();
  const fieldStoreCache = new Map<string, Readable<unknown>>();

  // ============ Helper Functions ============

  function createMutableSyncStatus() {
    return {
      isSyncing: false,
      isOnline: true,
      isPaused: false,
      hasPendingSync: false,
      lastSyncedAt: null as number | null,
      syncError: null as Error | null,
      get displayState(): 'syncing' | 'offline' | 'paused' | 'error' | 'idle' {
        if (this.isSyncing) return 'syncing';
        if (!this.isOnline) return 'offline';
        if (this.isPaused) return 'paused';
        if (this.syncError) return 'error';
        return 'idle';
      },
    };
  }

  function createMutableStorageStatus() {
    return {
      isSaving: false,
      lastSavedAt: null as number | null,
      storageError: null as Error | null,
      get displayState(): 'saving' | 'error' | 'idle' {
        if (this.isSaving) return 'saving';
        if (this.storageError) return 'error';
        return 'idle';
      },
    };
  }

  function checkBackgroundMutation(): void {
    if (!isCurrentHandler()) {
      switch (backgroundMutationBehavior) {
        case 'throw':
          throw new Error(
            `Cannot mutate handler for ${account}: not current account`
          );
        case 'warn':
          console.warn(`Mutating background handler for ${account}`);
          break;
        case 'allow':
          // Silent proceed
          break;
      }
    }
  }

  function createDefaultInternalStorage(): InternalStorage<S> {
    return {
      $version: schemaVersion,
      data: defaultData(),
      $timestamps: {} as InternalStorage<S>['$timestamps'],
      $itemTimestamps: {} as InternalStorage<S>['$itemTimestamps'],
      $tombstones: {} as InternalStorage<S>['$tombstones'],
    };
  }

  // ============ Storage Operations ============
  // (Same logic as current, but operating on this handler's state)

  async function doStorageSave(data: InternalStorage<S>): Promise<void> {
    try {
      await storage.save(storageKey, data);
      mutableStorageStatus.lastSavedAt = clock();
    } catch (error) {
      mutableStorageStatus.storageError = error as Error;
      emitStorageEvent({type: 'failed', error: error as Error});
      throw error;
    }
  }

  async function processStorageSave(data: InternalStorage<S>): Promise<void> {
    try {
      await doStorageSave(data);
    } catch {
      // Error already handled
    }

    if (storageSavePending) {
      const pending = storageSavePending;
      storageSavePending = null;
      mutableStorageStatus.storageError = null;
      emitStorageEvent({type: 'saving'});
      await processStorageSave(pending);
    } else {
      mutableStorageStatus.isSaving = false;
      emitStorageEvent({
        type: 'saved',
        timestamp: mutableStorageStatus.lastSavedAt ?? clock(),
      });
    }
  }

  function saveToStorage(data: InternalStorage<S>): Promise<void> {
    if (mutableStorageStatus.isSaving) {
      storageSavePending = data;
      mutableStorageStatus.storageError = null;
      return currentSavePromise!;
    }

    mutableStorageStatus.isSaving = true;
    storageSavePending = null;
    mutableStorageStatus.storageError = null;
    emitStorageEvent({type: 'saving'});

    currentSavePromise = processStorageSave(data);
    return currentSavePromise;
  }

  // ============ Sync Operations ============
  // (Same logic as current performSync, but on this handler's state)

  function markDirty(): void {
    if (!syncAdapter) return;
    syncDirty = true;
    mutableSyncStatus.hasPendingSync = true;
    emitSyncEvent({type: 'pending'});
    scheduleSync();
  }

  function scheduleSync(): void {
    if (!syncAdapter || syncPaused) return;

    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }

    syncDebounceTimer = setTimeout(() => {
      performSync();
    }, debounceMs);
  }

  async function performSync(retryCount = 0): Promise<void> {
    if (!syncAdapter || !internalStorage || asyncState.status !== 'ready') return;

    try {
      mutableSyncStatus.isSyncing = true;
      mutableSyncStatus.syncError = null;
      
      if (retryCount === 0) {
        emitSyncEvent({type: 'started'});
      }

      // Pull from server
      const pullResponse = await syncAdapter.pull(account);

      // Merge
      const serverData = pullResponse.data ?? createDefaultInternalStorage();
      const {
        storage: cleanedMerged,
        changes,
        serverNeedsUpdate,
      } = mergeAndCleanup(internalStorage, serverData, schema, clock());

      // Update local state if changed
      if (changes.length > 0) {
        internalStorage = cleanedMerged;
        asyncState = {status: 'ready', data: cleanedMerged.data};

        for (const change of changes) {
          emitter.emit(
            change.event as keyof StoreEvents<S>,
            change.data as StoreEvents<S>[keyof StoreEvents<S>],
          );
        }

        await saveToStorage(cleanedMerged);
      }

      // Push if needed
      if (serverNeedsUpdate) {
        const clockBigInt = BigInt(clock());
        const newCounter =
          clockBigInt > pullResponse.counter
            ? clockBigInt
            : pullResponse.counter + 1n;
        
        const pushResponse = await syncAdapter.push(account, cleanedMerged, newCounter);

        if (!pushResponse.success) {
          if (retryCount < maxRetries) {
            const backoffDelay = retryBackoffMs * Math.pow(2, retryCount);
            setTimeout(() => performSync(retryCount + 1), backoffDelay);
            return;
          } else {
            throw new Error(pushResponse.error || 'Push rejected after max retries');
          }
        }

        syncDirty = false;
        mutableSyncStatus.lastSyncedAt = clock();
        mutableSyncStatus.hasPendingSync = false;
        mutableSyncStatus.syncError = null;
        mutableSyncStatus.isSyncing = false;
        emitSyncEvent({type: 'completed', timestamp: clock()});
      } else {
        mutableSyncStatus.syncError = null;
        mutableSyncStatus.isSyncing = false;
      }
    } catch (error) {
      if (retryCount < maxRetries) {
        const backoffDelay = retryBackoffMs * Math.pow(2, retryCount);
        setTimeout(() => performSync(retryCount + 1), backoffDelay);
      } else {
        mutableSyncStatus.syncError = error as Error;
        mutableSyncStatus.isSyncing = false;
        emitSyncEvent({type: 'failed', error: error as Error});
      }
    }
  }

  // ============ Event Helpers ============

  function emitSyncEvent(event: StoreEvents<S>['$store:sync']): void {
    emitter.emit('$store:sync', event);
  }

  function emitStorageEvent(event: StoreEvents<S>['$store:storage']): void {
    emitter.emit('$store:storage', event);
  }

  function emitStateEvent(event: StoreEvents<S>['$store:state']): void {
    emitter.emit('$store:state', event);
  }

  // ============ Load Implementation ============

  async function load(): Promise<void> {
    asyncState = {status: 'loading'};
    emitStateEvent({type: 'loading'});

    const localData = await storage.load(storageKey);

    if (localData) {
      const storedVersion = localData.$version ?? 0;

      if (storedVersion < schemaVersion) {
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
          mutableStorageStatus.storageError = error as Error;
          emitStorageEvent({type: 'failed', error: error as Error});
          asyncState = {status: 'error', error: error as Error};
          return;
        }
      } else {
        internalStorage = localData;
      }
    } else {
      internalStorage = createDefaultInternalStorage();
    }

    // Cleanup expired items
    const {storage: cleanedStorage} = cleanup(internalStorage, schema, clock());
    internalStorage = cleanedStorage;

    // Save cleaned state
    await saveToStorage(internalStorage);

    // Ready
    asyncState = {status: 'ready', data: internalStorage.data};
    emitStateEvent({type: 'ready'});

    // Initial sync
    if (syncAdapter) {
      performSync();
    }
  }

  // ============ Handler Object ============

  const handler: AccountHandler<S> = {
    get account() {
      return account;
    },

    get asyncState() {
      return asyncState;
    },

    get syncStatus(): SyncStatus {
      return mutableSyncStatus;
    },

    get storageStatus(): StorageStatus {
      return mutableStorageStatus;
    },

    get isCurrent() {
      return isCurrentHandler();
    },

    get backgroundMutationBehavior() {
      return backgroundMutationBehavior;
    },

    set backgroundMutationBehavior(value) {
      backgroundMutationBehavior = value;
    },

    // Mutation methods
    set(field, value) {
      checkBackgroundMutation();
      if (asyncState.status !== 'ready' || !internalStorage) {
        throw new Error('Handler is not ready');
      }

      const now = clock();
      (internalStorage.data as Record<string, unknown>)[field as string] = value;
      (internalStorage.$timestamps as Record<string, number>)[field as string] = now;

      asyncState = {status: 'ready', data: {...internalStorage.data}};

      emitter.emit(
        `${String(field)}:changed` as keyof StoreEvents<S>,
        value as StoreEvents<S>[keyof StoreEvents<S>],
      );

      saveToStorage(internalStorage);
      markDirty();
    },

    patch(field, value) {
      checkBackgroundMutation();
      if (asyncState.status !== 'ready' || !internalStorage) {
        throw new Error('Handler is not ready');
      }

      const now = clock();
      const current = (internalStorage.data as Record<string, unknown>)[field as string];
      const merged = deepMerge(current, value);

      (internalStorage.data as Record<string, unknown>)[field as string] = merged;
      (internalStorage.$timestamps as Record<string, number>)[field as string] = now;

      asyncState = {status: 'ready', data: {...internalStorage.data}};

      emitter.emit(
        `${String(field)}:changed` as keyof StoreEvents<S>,
        merged as StoreEvents<S>[keyof StoreEvents<S>],
      );

      saveToStorage(internalStorage);
      markDirty();
    },

    add(field, key, value, options) {
      checkBackgroundMutation();
      if (asyncState.status !== 'ready' || !internalStorage) {
        throw new Error('Handler is not ready');
      }

      const now = clock();
      const items = ((internalStorage.data as Record<string, unknown>)[field as string] ?? {}) as Record<string, unknown>;
      const timestamps = (internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] ?? {};

      const itemWithDeleteAt = {...(value as object), deleteAt: options.deleteAt};
      items[key] = itemWithDeleteAt;
      timestamps[key] = now;

      (internalStorage.data as Record<string, unknown>)[field as string] = items;
      (internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] = timestamps;

      asyncState = {status: 'ready', data: {...internalStorage.data}};

      emitter.emit(
        `${String(field)}:added` as keyof StoreEvents<S>,
        {key, item: itemWithDeleteAt} as StoreEvents<S>[keyof StoreEvents<S>],
      );

      saveToStorage(internalStorage);
      markDirty();
    },

    update(field, key, value) {
      checkBackgroundMutation();
      if (asyncState.status !== 'ready' || !internalStorage) {
        throw new Error('Handler is not ready');
      }

      const items = ((internalStorage.data as Record<string, unknown>)[field as string] ?? {}) as Record<string, {deleteAt: number}>;
      const existing = items[key];

      if (!existing) {
        throw new Error(`Item ${key} does not exist in ${String(field)}`);
      }

      const now = clock();
      const timestamps = (internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] ?? {};

      const updatedItem = {...(value as object), deleteAt: existing.deleteAt};
      items[key] = updatedItem;
      timestamps[key] = now;

      (internalStorage.data as Record<string, unknown>)[field as string] = items;
      (internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] = timestamps;

      asyncState = {status: 'ready', data: {...internalStorage.data}};

      emitter.emit(
        `${String(field)}:updated` as keyof StoreEvents<S>,
        {key, item: updatedItem} as StoreEvents<S>[keyof StoreEvents<S>],
      );

      saveToStorage(internalStorage);
      markDirty();
    },

    remove(field, key) {
      checkBackgroundMutation();
      if (asyncState.status !== 'ready' || !internalStorage) {
        throw new Error('Handler is not ready');
      }

      const items = ((internalStorage.data as Record<string, unknown>)[field as string] ?? {}) as Record<string, {deleteAt: number}>;
      const existing = items[key];

      if (!existing) {
        throw new Error(`Item ${key} does not exist in ${String(field)}`);
      }

      // Create tombstone
      const tombstones = (internalStorage.$tombstones as Record<string, Record<string, number>>)[field as string] ?? {};
      tombstones[key] = existing.deleteAt;
      (internalStorage.$tombstones as Record<string, Record<string, number>>)[field as string] = tombstones;

      // Remove item and timestamp
      delete items[key];
      const timestamps = (internalStorage.$itemTimestamps as Record<string, Record<string, number>>)[field as string] ?? {};
      delete timestamps[key];

      asyncState = {status: 'ready', data: {...internalStorage.data}};

      emitter.emit(
        `${String(field)}:removed` as keyof StoreEvents<S>,
        {key, item: existing} as StoreEvents<S>[keyof StoreEvents<S>],
      );

      saveToStorage(internalStorage);
      markDirty();
    },

    // Sync control
    async syncNow() {
      if (!syncAdapter || asyncState.status !== 'ready') return;

      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = undefined;
      }

      await performSync();
    },

    pauseSync() {
      syncPaused = true;
      mutableSyncStatus.isPaused = true;
      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = undefined;
      }
      emitSyncEvent({type: 'paused'});
    },

    resumeSync() {
      syncPaused = false;
      mutableSyncStatus.isPaused = false;
      emitSyncEvent({type: 'resumed'});
      if (syncDirty) {
        scheduleSync();
      }
    },

    // Lifecycle
    load,

    start() {
      // Set up storage watch for cross-tab sync
      if (isWatchable(storage)) {
        unwatchStorage = storage.watch(storageKey, async (_, newValue) => {
          if (!newValue || !internalStorage) return;

          const {storage: cleanedMerged, changes} = mergeAndCleanup(
            internalStorage,
            newValue,
            schema,
            clock(),
          );

          if (changes.length > 0) {
            internalStorage = cleanedMerged;

            if (asyncState.status === 'ready') {
              asyncState = {status: 'ready', data: cleanedMerged.data};
            }

            for (const change of changes) {
              emitter.emit(
                change.event as keyof StoreEvents<S>,
                change.data as StoreEvents<S>[keyof StoreEvents<S>],
              );
            }
          }
        });
      }
    },

    stop() {
      unwatchStorage?.();
      unwatchStorage = undefined;

      if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer);
        syncDebounceTimer = undefined;
      }

      itemStoreCache.clear();
      fieldStoreCache.clear();
    },

    retryLoad() {
      if (asyncState.status !== 'error') {
        throw new Error('Cannot retry if not in error state');
      }

      mutableStorageStatus.storageError = null;
      load();
    },

    async flush(timeoutMs = 30000) {
      const startTime = clock();
      while (mutableStorageStatus.isSaving) {
        if (clock() - startTime > timeoutMs) {
          throw new Error(`flush() timed out after ${timeoutMs}ms`);
        }
        await new Promise((r) => setTimeout(r, 10));
      }
    },

    hasPendingWork() {
      return (
        mutableStorageStatus.isSaving ||
        mutableSyncStatus.isSyncing ||
        mutableSyncStatus.hasPendingSync ||
        storageSavePending !== null
      );
    },

    // Events
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),

    // Fine-grained stores
    getItemStore(field, key) {
      // Same implementation as current, using this handler's emitter
      const cacheKey = `${String(field)}:${key}`;
      const cached = itemStoreCache.get(cacheKey);
      if (cached) return cached as Readable<unknown>;

      const getCurrentValue = () => {
        if (asyncState.status !== 'ready') return undefined;
        const items = (asyncState.data[field] as Record<string, unknown>) ?? {};
        return items[key];
      };

      const itemStore: Readable<unknown> = {
        subscribe(callback) {
          callback(getCurrentValue());

          const unsubState = emitter.on('$store:state', () => callback(getCurrentValue()));
          const unsubAdded = emitter.on(`${String(field)}:added` as keyof StoreEvents<S>, (e) => {
            const event = e as {key: string; item: unknown};
            if (event.key === key) callback(event.item);
          });
          const unsubUpdated = emitter.on(`${String(field)}:updated` as keyof StoreEvents<S>, (e) => {
            const event = e as {key: string; item: unknown};
            if (event.key === key) callback(event.item);
          });
          const unsubRemoved = emitter.on(`${String(field)}:removed` as keyof StoreEvents<S>, (e) => {
            const event = e as {key: string};
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

      itemStoreCache.set(cacheKey, itemStore);
      return itemStore;
    },

    getFieldStore(field) {
      // Same implementation as current, using this handler's emitter
      const cacheKey = String(field);
      const cached = fieldStoreCache.get(cacheKey);
      if (cached) return cached as Readable<unknown>;

      const getCurrentValue = () => {
        if (asyncState.status !== 'ready') return undefined;
        return asyncState.data[field];
      };

      const fieldDef = schema[field];
      const isMap = fieldDef.__type === 'map';

      const fieldStore: Readable<unknown> = {
        subscribe(callback) {
          callback(getCurrentValue());

          const unsubState = emitter.on('$store:state', () => callback(getCurrentValue()));
          const unsubs: (() => void)[] = [unsubState];

          if (isMap) {
            unsubs.push(
              emitter.on(`${String(field)}:added` as keyof StoreEvents<S>, () => callback(getCurrentValue())),
              emitter.on(`${String(field)}:removed` as keyof StoreEvents<S>, () => callback(getCurrentValue())),
            );
          } else {
            unsubs.push(
              emitter.on(`${String(field)}:changed` as keyof StoreEvents<S>, () => callback(getCurrentValue())),
            );
          }

          return () => {
            for (const unsub of unsubs) unsub();
          };
        },
      };

      fieldStoreCache.set(cacheKey, fieldStore);
      return fieldStore;
    },
  };

  return handler;
}

// ============ Helpers ============

function deepMerge<T>(target: T, source: unknown): T {
  if (typeof source !== 'object' || source === null) {
    return source as T;
  }

  if (Array.isArray(source)) {
    return source as T;
  }

  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    return source as T;
  }

  const result = {...target};

  for (const key of Object.keys(source as object) as (keyof T)[]) {
    const sourceValue = (source as Record<string, unknown>)[key as string];
    if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        target[key],
        sourceValue,
      );
    }
  }

  return result;
}
```

## Key Differences from Current Implementation

1. **No account switching logic** - Handler only knows about its own account
2. **No loadGeneration** - Not needed since handler doesn't switch accounts
3. **Self-contained status** - Each handler has its own status objects
4. **isCurrentHandler callback** - Used for `isCurrent` and background mutation checks
5. **No global listeners** - Visibility, online/offline handled at store level

## Checklist

- [ ] Create `accountHandler.ts` file
- [ ] Implement `createAccountHandler` function
- [ ] Implement all mutation methods
- [ ] Implement sync operations
- [ ] Implement storage operations
- [ ] Implement lifecycle methods
- [ ] Implement fine-grained stores
- [ ] Add deepMerge helper
- [ ] Export from `index.ts`

## Next Phase

After implementing the handler, proceed to [03-store-refactoring.md](./03-store-refactoring.md) to refactor the main store.
