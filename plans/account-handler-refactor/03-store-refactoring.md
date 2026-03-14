# Phase 3: Store Refactoring

## Overview

Refactor `createSyncableStore` to use the handler registry pattern. The store becomes an orchestrator that manages handlers and forwards events.

## Changes to `createSyncableStore.ts`

### New Structure

```typescript
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

  // ============ Handler Registry ============
  const handlers = new Map<`0x${string}`, AccountHandler<S>>();
  let currentAccount: `0x${string}` | undefined = undefined;

  // ============ Store State ============
  let storeAsyncState: AsyncState<DataOf<S>> = {status: 'idle', account: undefined};

  // ============ Store Event Emitter ============
  const storeEmitter = createEmitter<StoreEvents<S>>();

  // ============ Global Listeners ============
  let unsubscribeAccount: (() => void) | undefined;
  let handleVisibilityChange: (() => void) | undefined;
  let handleOnline: (() => void) | undefined;
  let handleOffline: (() => void) | undefined;
  let handleBeforeUnload: ((e: BeforeUnloadEvent) => void) | undefined;
  let syncIntervalTimer: ReturnType<typeof setInterval> | undefined;

  // ============ Handler Management ============

  function getOrCreateHandler(account: `0x${string}`): AccountHandler<S> {
    let handler = handlers.get(account);
    if (!handler) {
      handler = createAccountHandler(account, {
        schema,
        storage,
        storageKey: storageKey(account),
        defaultData,
        clock,
        schemaVersion,
        migrations,
        syncAdapter,
        syncConfig,
        isCurrentHandler: () => currentAccount === account,
      });
      handlers.set(account, handler);
      wireHandlerEvents(handler);
    }
    return handler;
  }

  function getCurrentHandler(): AccountHandler<S> {
    if (!currentAccount) {
      throw new Error('No account connected');
    }
    const handler = handlers.get(currentAccount);
    if (!handler) {
      throw new Error('Handler not found for current account');
    }
    return handler;
  }

  // ============ Event Forwarding ============
  // See 04-event-forwarding.md for details

  function wireHandlerEvents(handler: AccountHandler<S>): void {
    // Forward state events
    handler.on('$store:state', (event) => {
      if (handler.account === currentAccount) {
        // Update store state
        if (event.type === 'ready' && handler.asyncState.status === 'ready') {
          storeAsyncState = {
            status: 'ready',
            account: handler.account,
            data: handler.asyncState.data,
          };
        } else if (event.type === 'loading') {
          storeAsyncState = {status: 'loading', account: handler.account};
        }
        storeEmitter.emit('$store:state', event);
      }
    });

    // Forward sync events
    handler.on('$store:sync', (event) => {
      if (handler.account === currentAccount) {
        storeEmitter.emit('$store:sync', event);
      }
    });

    // Forward storage events
    handler.on('$store:storage', (event) => {
      if (handler.account === currentAccount) {
        storeEmitter.emit('$store:storage', event);
      }
    });

    // Forward field-level events
    for (const field of Object.keys(schema)) {
      const fieldDef = schema[field];
      if (fieldDef.__type === 'permanent') {
        handler.on(`${field}:changed` as keyof StoreEvents<S>, (data) => {
          if (handler.account === currentAccount) {
            storeEmitter.emit(`${field}:changed` as keyof StoreEvents<S>, data);
          }
        });
      } else if (fieldDef.__type === 'map') {
        handler.on(`${field}:added` as keyof StoreEvents<S>, (data) => {
          if (handler.account === currentAccount) {
            storeEmitter.emit(`${field}:added` as keyof StoreEvents<S>, data);
          }
        });
        handler.on(`${field}:updated` as keyof StoreEvents<S>, (data) => {
          if (handler.account === currentAccount) {
            storeEmitter.emit(`${field}:updated` as keyof StoreEvents<S>, data);
          }
        });
        handler.on(`${field}:removed` as keyof StoreEvents<S>, (data) => {
          if (handler.account === currentAccount) {
            storeEmitter.emit(`${field}:removed` as keyof StoreEvents<S>, data);
          }
        });
      }
    }
  }

  // ============ Account Switching ============

  async function setAccount(newAccount: `0x${string}` | undefined): Promise<void> {
    if (newAccount === currentAccount) return;

    currentAccount = newAccount;

    if (!newAccount) {
      // Transition to idle
      storeAsyncState = {status: 'idle', account: undefined};
      storeEmitter.emit('$store:state', {type: 'idle'});
      return;
    }

    // Get or create handler
    const handler = getOrCreateHandler(newAccount);

    // Transition to loading
    storeAsyncState = {status: 'loading', account: newAccount};
    storeEmitter.emit('$store:state', {type: 'loading'});

    // Load if not already loaded
    if (handler.asyncState.status === 'loading') {
      await handler.load();
      handler.start();
    }

    // Update store state from handler
    if (handler.asyncState.status === 'ready') {
      storeAsyncState = {
        status: 'ready',
        account: newAccount,
        data: handler.asyncState.data,
      };
      storeEmitter.emit('$store:state', {type: 'ready'});
    }
  }

  // ============ Store Object ============

  const store: SyncableStore<S> = {
    // State
    get state() {
      return storeAsyncState;
    },

    // New: Handler access
    getHandler() {
      return getCurrentHandler();
    },

    getHandlerFor(account: `0x${string}`) {
      return getOrCreateHandler(account);
    },

    get currentAccount() {
      return currentAccount;
    },

    get hasAccount() {
      return currentAccount !== undefined;
    },

    // Convenience mutation methods (proxy to current handler)
    set(field, value) {
      getCurrentHandler().set(field, value);
    },

    patch(field, value) {
      getCurrentHandler().patch(field, value);
    },

    add(field, key, value, options) {
      getCurrentHandler().add(field, key, value, options);
    },

    update(field, key, value) {
      getCurrentHandler().update(field, key, value);
    },

    remove(field, key) {
      getCurrentHandler().remove(field, key);
    },

    // Subscribe to store state changes
    subscribe(callback) {
      callback(storeAsyncState);
      return storeEmitter.on('$store:state', () => callback(storeAsyncState));
    },

    // Event subscription
    on: storeEmitter.on.bind(storeEmitter),
    off: storeEmitter.off.bind(storeEmitter),

    // Status stores (proxy to current handler)
    get syncStatusStore(): Readable<SyncStatus> {
      return {
        subscribe(callback) {
          const handler = currentAccount ? handlers.get(currentAccount) : undefined;
          const status = handler?.syncStatus ?? createDefaultSyncStatus();
          callback(status);
          
          return storeEmitter.on('$store:sync', () => {
            const h = currentAccount ? handlers.get(currentAccount) : undefined;
            callback(h?.syncStatus ?? createDefaultSyncStatus());
          });
        },
      };
    },

    get storageStatusStore(): Readable<StorageStatus> {
      return {
        subscribe(callback) {
          const handler = currentAccount ? handlers.get(currentAccount) : undefined;
          const status = handler?.storageStatus ?? createDefaultStorageStatus();
          callback(status);
          
          return storeEmitter.on('$store:storage', () => {
            const h = currentAccount ? handlers.get(currentAccount) : undefined;
            callback(h?.storageStatus ?? createDefaultStorageStatus());
          });
        },
      };
    },

    // Sync control (proxy to current handler)
    async syncNow() {
      if (!currentAccount) return;
      return getCurrentHandler().syncNow();
    },

    pauseSync() {
      if (!currentAccount) return;
      getCurrentHandler().pauseSync();
    },

    resumeSync() {
      if (!currentAccount) return;
      getCurrentHandler().resumeSync();
    },

    retryLoad() {
      if (!currentAccount) {
        throw new Error('No account connected');
      }
      getCurrentHandler().retryLoad();
    },

    // Fine-grained stores (proxy to current handler)
    getItemStore(field, key) {
      // Return a store that tracks current handler
      return {
        subscribe(callback) {
          const handler = currentAccount ? handlers.get(currentAccount) : undefined;
          const itemStore = handler?.getItemStore(field, key);
          
          if (itemStore) {
            return itemStore.subscribe(callback);
          } else {
            callback(undefined);
            return () => {};
          }
        },
      };
    },

    getFieldStore(field) {
      return {
        subscribe(callback) {
          const handler = currentAccount ? handlers.get(currentAccount) : undefined;
          const fieldStore = handler?.getFieldStore(field);
          
          if (fieldStore) {
            return fieldStore.subscribe(callback);
          } else {
            callback(undefined);
            return () => {};
          }
        },
      };
    },

    // Lifecycle
    start() {
      // Subscribe to account changes
      unsubscribeAccount = accountStore.subscribe((account) => {
        setAccount(account);
      });

      // Global visibility listener
      if (syncConfig?.syncOnVisible !== false && typeof document !== 'undefined') {
        handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && currentAccount) {
            const handler = handlers.get(currentAccount);
            if (handler?.asyncState.status === 'ready') {
              handler.syncNow();
            }
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      // Global online/offline listeners
      if (syncConfig?.syncOnReconnect !== false && typeof window !== 'undefined') {
        handleOnline = () => {
          // Update all handlers' online status
          for (const handler of handlers.values()) {
            (handler.syncStatus as {isOnline: boolean}).isOnline = true;
          }
          // Sync current handler
          if (currentAccount) {
            const handler = handlers.get(currentAccount);
            handler?.on('$store:sync', () => {}); // Trigger re-read
            storeEmitter.emit('$store:sync', {type: 'online'});
            if (handler?.asyncState.status === 'ready') {
              handler.syncNow();
            }
          }
        };
        handleOffline = () => {
          for (const handler of handlers.values()) {
            (handler.syncStatus as {isOnline: boolean}).isOnline = false;
          }
          if (currentAccount) {
            storeEmitter.emit('$store:sync', {type: 'offline'});
          }
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
      }

      // Periodic sync
      const intervalMs = syncConfig?.intervalMs;
      if (syncAdapter && intervalMs && intervalMs > 0) {
        syncIntervalTimer = setInterval(() => {
          if (currentAccount) {
            const handler = handlers.get(currentAccount);
            if (handler?.asyncState.status === 'ready' && !handler.syncStatus.isPaused) {
              handler.syncNow();
            }
          }
        }, intervalMs);
      }

      // Beforeunload warning
      if (typeof window !== 'undefined') {
        handleBeforeUnload = (e: BeforeUnloadEvent) => {
          // Check if any handler has pending work
          for (const handler of handlers.values()) {
            if (handler.hasPendingWork()) {
              e.preventDefault();
              e.returnValue = 'You have unsaved changes.';
              return;
            }
          }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
      }

      return () => store.stop();
    },

    stop() {
      unsubscribeAccount?.();
      unsubscribeAccount = undefined;

      // Stop all handlers
      for (const handler of handlers.values()) {
        handler.stop();
      }
      handlers.clear();

      // Clean up global listeners
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        handleVisibilityChange = undefined;
      }
      if (handleOnline) {
        window.removeEventListener('online', handleOnline);
        handleOnline = undefined;
      }
      if (handleOffline) {
        window.removeEventListener('offline', handleOffline);
        handleOffline = undefined;
      }
      if (syncIntervalTimer) {
        clearInterval(syncIntervalTimer);
        syncIntervalTimer = undefined;
      }
      if (handleBeforeUnload) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        handleBeforeUnload = undefined;
      }
    },

    async flush(timeoutMs) {
      // Flush all handlers
      await Promise.all(
        Array.from(handlers.values()).map((h) => h.flush(timeoutMs))
      );
    },
  };

  return store;
}

// ============ Default Status Factories ============

function createDefaultSyncStatus(): SyncStatus {
  return {
    isSyncing: false,
    isOnline: true,
    isPaused: false,
    hasPendingSync: false,
    lastSyncedAt: null,
    syncError: null,
    get displayState() {
      return 'idle';
    },
  };
}

function createDefaultStorageStatus(): StorageStatus {
  return {
    isSaving: false,
    lastSavedAt: null,
    storageError: null,
    get displayState() {
      return 'idle';
    },
  };
}
```

## Key Changes Summary

| Aspect | Before | After |
|--------|--------|-------|
| State ownership | Store owns all state | Each handler owns its state |
| Status objects | Global singletons | Per-handler |
| Account switching | Complex loadGeneration logic | Just switch currentAccount |
| Event emission | Direct | Forward from current handler |
| Global listeners | In store | In store, signals handlers |
| Mutation methods | Direct implementation | Proxy to getCurrentHandler() |

## Removed Code

The following can be removed from `createSyncableStore.ts`:

- `loadGeneration` and related race condition handling
- `mutableSyncStatus` and `mutableStorageStatus` (moved to handler)
- `internalStorage` (moved to handler)
- `storageSavePending`, `currentSavePromise` (moved to handler)
- `syncDebounceTimer`, `syncDirty`, `syncPaused` (moved to handler)
- `setAccount` async logic (simplified)
- All mutation method implementations (now in handler)
- `doStorageSave`, `processStorageSave`, `saveToStorage` (moved to handler)
- `performSync`, `markDirty`, `scheduleSync` (moved to handler)
- Item/field store caches (moved to handler)

## Checklist

- [ ] Add handler registry and currentAccount
- [ ] Add getOrCreateHandler function
- [ ] Add getCurrentHandler function
- [ ] Add wireHandlerEvents function
- [ ] Simplify setAccount to use handlers
- [ ] Update state getter to use storeAsyncState
- [ ] Add getHandler() and getHandlerFor() methods
- [ ] Update mutation methods to proxy to handler
- [ ] Update status stores to proxy to handler
- [ ] Update sync control methods to proxy to handler
- [ ] Update fine-grained stores to proxy to handler
- [ ] Keep global listeners at store level
- [ ] Update start() to manage handlers
- [ ] Update stop() to clean up all handlers
- [ ] Update flush() to flush all handlers
- [ ] Remove old implementation code

## Next Phase

After refactoring the store, proceed to [04-event-forwarding.md](./04-event-forwarding.md) for event architecture details.
