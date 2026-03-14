# Per-Account Handler Architecture

## Overview

Instead of having global status objects with per-account error tracking, restructure `createSyncableStore` so that each account gets its own isolated handler. This provides complete isolation by design, eliminating race conditions and status leakage between accounts.

## Current Architecture (Problem)

```
┌─────────────────────────────────────────────────────────┐
│  createSyncableStore                                     │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ mutableSyncStatus │  │mutableStorageStatus│  GLOBAL   │
│  │  isSyncing        │  │  isSaving          │           │
│  │  syncError ←──────┼──┼──────────────────┼── SHARED!  │
│  └──────────────────┘  └──────────────────┘              │
│                                                          │
│  asyncState.account = A or B (switches)                  │
│  internalStorage = A's or B's data (switches)            │
│                                                          │
│  Async operations update global status                   │
│  → Race condition when account changes mid-operation     │
└─────────────────────────────────────────────────────────┘
```

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────┐
│  createSyncableStore                                     │
│                                                          │
│  handlers: Map<account, AccountHandler>                  │
│  currentHandler: AccountHandler | null                   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  AccountHandler for 0xA                          │    │
│  │  ┌─────────────┐  ┌──────────────┐               │    │
│  │  │ syncStatus  │  │storageStatus │  ISOLATED     │    │
│  │  │ isSyncing   │  │ isSaving     │               │    │
│  │  │ syncError   │  │ storageError │               │    │
│  │  └─────────────┘  └──────────────┘               │    │
│  │  internalStorage: A's data                       │    │
│  │  saveQueue: A's pending saves                    │    │
│  │  syncTimer: A's debounce timer                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  AccountHandler for 0xB                          │    │
│  │  (completely independent)                        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Public API proxies to currentHandler                    │
└─────────────────────────────────────────────────────────┘
```

## Core Types

### AccountHandler Interface

```typescript
/**
 * Internal handler for a single account's data and operations.
 * Each account gets its own isolated handler with independent state.
 */
interface AccountHandler<S extends Schema> {
  /** The account this handler manages */
  readonly account: `0x${string}`;
  
  /** Current async state (loading/ready) */
  readonly asyncState: AccountAsyncState<DataOf<S>>;
  
  /** Internal storage with timestamps */
  readonly internalStorage: InternalStorage<S> | null;
  
  /** Sync status - isolated to this account */
  readonly syncStatus: SyncStatus;
  
  /** Storage status - isolated to this account */
  readonly storageStatus: StorageStatus;
  
  /** Load data from storage */
  load(): Promise<void>;
  
  /** Mutation methods */
  set<K extends PermanentKeys<S>>(field: K, value: ExtractPermanent<S[K]>): void;
  patch<K extends PermanentKeys<S>>(field: K, value: DeepPartial<ExtractPermanent<S[K]>>): void;
  add<K extends MapKeys<S>>(field: K, key: string, value: ExtractMapItem<S[K]>, options: {deleteAt: number}): void;
  update<K extends MapKeys<S>>(field: K, key: string, value: ExtractMapItem<S[K]>): void;
  remove<K extends MapKeys<S>>(field: K, key: string): void;
  
  /** Sync control */
  syncNow(): Promise<void>;
  pauseSync(): void;
  resumeSync(): void;
  
  /** Lifecycle */
  start(): void;  // Start storage watch, periodic sync, etc.
  stop(): void;   // Clean up timers, watchers
  
  /** Wait for pending operations to complete */
  flush(timeoutMs?: number): Promise<void>;
  
  /** Check if handler has pending work */
  hasPendingWork(): boolean;
  
  /** Event emitter for this handler */
  readonly emitter: EventEmitter<StoreEvents<S>>;
}

/**
 * Account-specific async state (no account field needed - handler owns it)
 */
type AccountAsyncState<T> =
  | {status: 'loading'}
  | {status: 'ready'; data: T};
```

### Handler Lifecycle States

```typescript
/**
 * Handler lifecycle for cleanup management
 */
type HandlerState = 
  | 'active'      // Currently being used
  | 'background'  // Has pending work, kept alive
  | 'idle'        // No pending work, can be disposed
  | 'disposed';   // Cleaned up
```

## Implementation Structure

### createAccountHandler Factory

```typescript
function createAccountHandler<S extends Schema>(
  account: `0x${string}`,
  config: AccountHandlerConfig<S>,
): AccountHandler<S> {
  // Private state - completely isolated
  let asyncState: AccountAsyncState<DataOf<S>> = {status: 'loading'};
  let internalStorage: InternalStorage<S> | null = null;
  
  // Storage queue - isolated
  let storageSavePending: InternalStorage<S> | null = null;
  let currentSavePromise: Promise<void> | null = null;
  
  // Sync state - isolated
  let syncDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let syncDirty = false;
  let syncPaused = false;
  
  // Status objects - isolated to this handler
  const mutableSyncStatus = createMutableSyncStatus();
  const mutableStorageStatus = createMutableStorageStatus();
  
  // Event emitter - isolated
  const emitter = createEmitter<StoreEvents<S>>();
  
  // ... all the methods, operating only on this handler's state
  
  return handler;
}
```

### Main Store with Handler Management

```typescript
export function createSyncableStore<S extends Schema>(
  config: SyncableStoreConfig<S>,
): SyncableStore<S> {
  // Handler registry
  const handlers = new Map<`0x${string}`, AccountHandler<S>>();
  let currentAccount: `0x${string}` | undefined = undefined;
  
  // Overall store state (for idle state when no account)
  let storeAsyncState: AsyncState<DataOf<S>> = {status: 'idle', account: undefined};
  
  // Main event emitter (proxies from current handler)
  const storeEmitter = createEmitter<StoreEvents<S>>();
  
  /**
   * Get existing handler or create new one
   */
  function getOrCreateHandler(account: `0x${string}`): AccountHandler<S> {
    let handler = handlers.get(account);
    if (!handler) {
      handler = createAccountHandler(account, {
        schema: config.schema,
        storage: config.storage,
        storageKey: config.storageKey,
        defaultData: config.defaultData,
        clock: config.clock,
        schemaVersion: config.schemaVersion,
        syncAdapter: config.sync,
        syncConfig: config.syncConfig,
        migrations: config.migrations,
      });
      handlers.set(account, handler);
    }
    return handler;
  }
  
  /**
   * Get current handler (throws if no account)
   */
  function getCurrentHandler(): AccountHandler<S> {
    if (!currentAccount) {
      throw new Error('No account connected');
    }
    return handlers.get(currentAccount)!;
  }
  
  /**
   * Set current account
   */
  async function setAccount(newAccount: `0x${string}` | undefined): Promise<void> {
    if (newAccount === currentAccount) return;
    
    const oldHandler = currentAccount ? handlers.get(currentAccount) : undefined;
    
    // Old handler continues running in background
    // It will complete its pending saves/syncs
    if (oldHandler) {
      // Optionally: mark as background, schedule cleanup
      scheduleHandlerCleanup(oldHandler);
    }
    
    currentAccount = newAccount;
    
    if (!newAccount) {
      // Transition to idle
      storeAsyncState = {status: 'idle', account: undefined};
      storeEmitter.emit('$store:state', {type: 'idle'});
      return;
    }
    
    // Get or create handler for new account
    const handler = getOrCreateHandler(newAccount);
    
    // Transition to loading
    storeAsyncState = {status: 'loading', account: newAccount};
    storeEmitter.emit('$store:state', {type: 'loading'});
    
    // Wire up event forwarding from handler to store
    wireHandlerEvents(handler);
    
    // Start handler if not already started
    if (handler.asyncState.status === 'loading') {
      await handler.load();
    }
    
    // Transition to ready
    if (handler.asyncState.status === 'ready') {
      storeAsyncState = {
        status: 'ready',
        account: newAccount,
        data: handler.asyncState.data,
      };
      storeEmitter.emit('$store:state', {type: 'ready'});
    }
  }
  
  /**
   * Wire handler events to store emitter
   */
  function wireHandlerEvents(handler: AccountHandler<S>): void {
    // Forward events from current handler to store
    // Only forward if handler is still current
    handler.emitter.on('$store:sync', (event) => {
      if (handler.account === currentAccount) {
        storeEmitter.emit('$store:sync', event);
      }
    });
    
    handler.emitter.on('$store:storage', (event) => {
      if (handler.account === currentAccount) {
        storeEmitter.emit('$store:storage', event);
      }
    });
    
    // ... other event forwarding
  }
  
  /**
   * Schedule cleanup of background handler
   */
  function scheduleHandlerCleanup(handler: AccountHandler<S>): void {
    // Wait for pending work to complete, then dispose
    const checkAndCleanup = async () => {
      if (!handler.hasPendingWork()) {
        // No pending work, safe to dispose
        handler.stop();
        
        // Keep in cache for quick switch-back, or remove to save memory
        // Option A: Remove immediately
        // handlers.delete(handler.account);
        
        // Option B: Keep in LRU cache with max size
        // handlerLRU.set(handler.account, handler);
      } else {
        // Still has work, check again later
        setTimeout(checkAndCleanup, 1000);
      }
    };
    
    // Give it a moment to complete
    setTimeout(checkAndCleanup, 100);
  }
  
  // Public store interface - proxies to current handler
  const store: SyncableStore<S> = {
    get state() {
      return storeAsyncState;
    },
    
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
    
    subscribe(callback) {
      callback(storeAsyncState);
      return storeEmitter.on('$store:state', () => callback(storeAsyncState));
    },
    
    // Status stores proxy to current handler
    get syncStatusStore() {
      return {
        subscribe(callback) {
          // Get current handler's status
          const handler = currentAccount ? handlers.get(currentAccount) : undefined;
          const status = handler?.syncStatus ?? createDefaultSyncStatus();
          callback(status);
          
          // Subscribe to sync events and re-read
          return storeEmitter.on('$store:sync', () => {
            const h = currentAccount ? handlers.get(currentAccount) : undefined;
            callback(h?.syncStatus ?? createDefaultSyncStatus());
          });
        },
      };
    },
    
    get storageStatusStore() {
      // Similar pattern
    },
    
    // Sync control
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
    
    // Lifecycle
    start() {
      // Subscribe to account changes
      unsubscribeAccount = config.account.subscribe((account) => {
        setAccount(account);
      });
      return () => store.stop();
    },
    
    stop() {
      unsubscribeAccount?.();
      // Stop all handlers
      for (const handler of handlers.values()) {
        handler.stop();
      }
      handlers.clear();
    },
    
    async flush(timeoutMs) {
      // Flush all handlers (current and background)
      await Promise.all(
        Array.from(handlers.values()).map(h => h.flush(timeoutMs))
      );
    },
    
    // Access to other accounts' handlers (advanced use)
    getHandlerForAccount(account: `0x${string}`) {
      return handlers.get(account);
    },
    
    // ... rest of API
  };
  
  return store;
}
```

## Key Benefits

### 1. Complete Status Isolation

Each handler has its own status objects:

```typescript
// Account A's handler
handlerA.syncStatus.isSyncing = true;
handlerA.syncStatus.syncError = null;

// Account B's handler (completely independent)
handlerB.syncStatus.isSyncing = false;
handlerB.syncStatus.syncError = null;
```

When user switches from A to B:
- B's syncStatus shows B's state (not A's)
- A's sync continues in background
- If A fails, only A's handler records the error
- UI shows B's clean state

### 2. Graceful Background Completion

```typescript
// User is on Account A, makes a change
store.set('settings', {value: 1}); // Triggers save for A

// User quickly switches to Account B
accountStore.setAccount('0xB');

// Handler A continues saving in background
// Handler A's storageSavePending processes
// Handler A's syncDebounceTimer fires
// All of A's operations complete independently

// Handler B loads and displays immediately
// B is not blocked by A's pending work
```

### 3. Natural Lifecycle Management

```typescript
function scheduleHandlerCleanup(handler: AccountHandler<S>): void {
  // Handler stays alive while:
  // - isSaving === true
  // - isSyncing === true
  // - hasPendingSync === true
  // - storageSavePending !== null
  
  if (!handler.hasPendingWork()) {
    // Safe to dispose
    handler.stop();
    handlers.delete(handler.account);
  } else {
    // Re-check later
    setTimeout(() => scheduleHandlerCleanup(handler), 1000);
  }
}
```

### 4. Event Architecture: Two Levels

With handler-first API, we have two event levels:

```
┌─────────────────────────────────────────────────────────────────┐
│  Handler A                         Handler B                     │
│  ┌──────────────┐                 ┌──────────────┐               │
│  │ emitter      │                 │ emitter      │               │
│  │ (all events) │                 │ (all events) │               │
│  └──────┬───────┘                 └──────┬───────┘               │
│         │                                │                       │
│         ▼                                ▼                       │
│     if A == current?              if B == current?               │
│         │                                │                       │
│         └────────────┬───────────────────┘                       │
│                      ▼                                           │
│             ┌────────────────┐                                   │
│             │ Store Emitter  │ ← UI subscribes here              │
│             │ (current only) │                                   │
│             └────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Handler's emitter** - All events for that account:
```typescript
// Useful for debugging, logging, or monitoring background operations
handler.emitter.on('$store:sync', (event) => {
  console.log(`Handler ${handler.account}: sync ${event.type}`);
});
```

**Store's emitter** - Only current account's events:
```typescript
// What UI components subscribe to
store.on('$store:sync', (event) => {
  // Only fires for current account
  updateUI(event);
});
```

**Event forwarding implementation:**
```typescript
function wireHandlerEvents(handler: AccountHandler<S>): void {
  // Forward events from handler to store, but only if current
  
  handler.emitter.on('$store:sync', (event) => {
    if (handler.account === currentAccount) {
      storeEmitter.emit('$store:sync', event);
    }
    // Background handler events NOT forwarded to store
  });
  
  handler.emitter.on('$store:storage', (event) => {
    if (handler.account === currentAccount) {
      storeEmitter.emit('$store:storage', event);
    }
  });
  
  // Field-level events also forwarded with account check
  // 'settings:changed', 'items:added', etc.
}
```

### 5. No Mutation Proxying Needed

With handler-first API, mutations go directly to handler:

```typescript
// User code
const handler = store.getHandler();
handler.set('settings', value);  // Direct call, no proxy

// Convenience methods on store can still exist:
store.set('settings', value);  // Just calls: this.getHandler().set('settings', value)
```

This simplifies the store's implementation - it's primarily:
1. Handler registry management
2. Event forwarding/filtering
3. State aggregation for UI

### 5. Optional: Access Background Handler Errors

```typescript
// Advanced API: Check if any background handler has errors
store.getBackgroundErrors(): Map<`0x${string}`, {
  storageError: Error | null;
  syncError: Error | null;
}> {
  const errors = new Map();
  for (const [account, handler] of handlers) {
    if (account !== currentAccount && 
        (handler.storageStatus.storageError || handler.syncStatus.syncError)) {
      errors.set(account, {
        storageError: handler.storageStatus.storageError,
        syncError: handler.syncStatus.syncError,
      });
    }
  }
  return errors;
}
```

## Handler Cache Strategy

### Option A: No Cache (Simple)

Handlers are disposed after their work completes:

```typescript
if (!handler.hasPendingWork()) {
  handler.stop();
  handlers.delete(handler.account);
}
```

- **Pros**: Simple, minimal memory
- **Cons**: Slow switch-back (reload from storage)

### Option B: Keep Recent Handlers (LRU)

Keep last N handlers in memory:

```typescript
const MAX_CACHED_HANDLERS = 3;

function maybeEvictOldHandlers(): void {
  const inactiveHandlers = Array.from(handlers.values())
    .filter(h => h.account !== currentAccount && !h.hasPendingWork());
  
  while (inactiveHandlers.length > MAX_CACHED_HANDLERS) {
    const oldest = inactiveHandlers.shift()!;
    oldest.stop();
    handlers.delete(oldest.account);
  }
}
```

- **Pros**: Fast switch-back for recent accounts
- **Cons**: More memory usage

### Option C: Keep Until Reload

Keep all handlers until page reload:

```typescript
// No cleanup except on stop()
```

- **Pros**: Fastest switch-back, simplest code
- **Cons**: Memory grows with accounts used

**Recommendation**: Start with Option C (keep all), add LRU if memory becomes an issue.

## Migration Path

### Phase 1: Create AccountHandler

Extract handler logic into a new internal module:

```typescript
// src/lib/core/sync/accountHandler.ts
export function createAccountHandler<S extends Schema>(
  account: `0x${string}`,
  config: AccountHandlerConfig<S>,
): AccountHandler<S> {
  // Move most of current createSyncableStore logic here
}
```

### Phase 2: Update createSyncableStore

Refactor main store to use handlers:

```typescript
// src/lib/core/sync/createSyncableStore.ts
export function createSyncableStore<S extends Schema>(
  config: SyncableStoreConfig<S>,
): SyncableStore<S> {
  const handlers = new Map<`0x${string}`, AccountHandler<S>>();
  // ... proxy logic
}
```

### Phase 3: Add Event Forwarding

Wire up event forwarding with account checks.

### Phase 4: Add Cleanup Logic

Implement handler lifecycle management.

## Test Plan

### Handler Isolation Tests

```typescript
describe('AccountHandler Isolation', () => {
  it('should have independent status objects', async () => {
    const handlerA = createAccountHandler('0xA', config);
    const handlerB = createAccountHandler('0xB', config);
    
    handlerA.syncStatus.isSyncing = true;
    
    expect(handlerA.syncStatus.isSyncing).toBe(true);
    expect(handlerB.syncStatus.isSyncing).toBe(false); // Independent!
  });
  
  it('should have independent error tracking', async () => {
    // Similar - errors don't leak
  });
});
```

### Account Switching Tests

```typescript
describe('Account Switching with Handlers', () => {
  it('should show new account status after switch', async () => {
    store.start();
    accountStore.setAccount('0xA');
    await waitForReady(store);
    
    // Start slow operation on A
    storage.setSaveDelay(1000);
    store.set('settings', {value: 1});
    
    expect(store.storageStatusStore.isSaving).toBe(true);
    
    // Switch to B
    accountStore.setAccount('0xB');
    await waitForReady(store);
    
    // B should show its own status (not saving)
    expect(store.storageStatusStore.isSaving).toBe(false);
  });
  
  it('should complete background operations after switch', async () => {
    // A's save should complete even after switching to B
  });
  
  it('should not emit events from background handlers', async () => {
    // Events from A's completion should not be emitted when B is current
  });
});
```

### Handler Lifecycle Tests

```typescript
describe('Handler Lifecycle', () => {
  it('should keep handler alive while saving', async () => {
    // ...
  });
  
  it('should dispose handler after work completes', async () => {
    // ...
  });
  
  it('should reuse handler on quick switch-back', async () => {
    // ...
  });
});
```

## Comparison with Original Plan

| Aspect | Original Plan (Error Registry) | Per-Account Handler |
|--------|-------------------------------|---------------------|
| Complexity | Medium - add maps, validate accounts | Higher - extract handler module |
| Isolation | Partial - shared status, separate errors | Complete - everything isolated |
| Memory | Lower - just error maps | Higher - full handler per account |
| Race Conditions | Need manual account checks | Eliminated by design |
| Background Ops | Still need account validation | Naturally isolated |
| Code Reuse | Modify existing code | Extract and reuse |
| Testability | Moderate | High - handlers are independent |

**Recommendation**: The per-account handler architecture is cleaner and more maintainable. The extra complexity is worthwhile for:
1. Elimination of race conditions by design
2. Better testability
3. Cleaner mental model
4. Future extensibility (e.g., multiple simultaneous accounts)

## Implementation Checklist

### Phase 1: Extract AccountHandler
- [ ] Create `accountHandler.ts` module
- [ ] Define `AccountHandler` interface
- [ ] Define `AccountHandlerConfig` type
- [ ] Implement `createAccountHandler` factory
- [ ] Move status creation to handler
- [ ] Move storage operations to handler
- [ ] Move sync operations to handler
- [ ] Move mutation methods to handler

### Phase 2: Refactor createSyncableStore
- [ ] Add handler registry
- [ ] Implement `getOrCreateHandler`
- [ ] Implement `setAccount` with handler management
- [ ] Proxy mutation methods to current handler
- [ ] Proxy status stores to current handler

### Phase 3: Event Management
- [ ] Wire handler events to store emitter
- [ ] Add account check before forwarding
- [ ] Update state transitions

### Phase 4: Lifecycle Management
- [ ] Implement `hasPendingWork()` on handler
- [ ] Implement cleanup scheduling
- [ ] Implement `flush()` for all handlers

### Phase 5: Tests
- [ ] Handler isolation tests
- [ ] Account switching tests
- [ ] Background completion tests
- [ ] Event forwarding tests
- [ ] Lifecycle tests
- [ ] Error handling tests

---

## Async Application Code Safety

### The Problem

Application code often has async workflows where account could switch mid-operation:

```typescript
async function submitForm(data: FormData) {
  const response = await api.submit(data); // Async wait
  // ⚠️ Account might have switched during await!
  store.set('settings', response.result); // Potentially wrong account!
}
```

### Solution: Multi-Level API

The per-account handler architecture naturally provides a solution.

#### Level 1: Simple API (Existing - Current Account)

For simple synchronous code, keep the existing API:

```typescript
// Operates on current account, throws if no account
store.set('settings', value);
store.add('items', key, value, {deleteAt});
```

This is fine for:
- Button click handlers (no await between)
- Immediate synchronous mutations

#### Level 2: Handler Reference for Async Code

For async workflows, capture a handler reference:

```typescript
// Method 1: Get current handler
const handler = store.getHandler(); // Throws if no account

// Method 2: Get handler for specific account
const handler = store.getHandlerFor('0xA'); // Creates if needed

// Use handler throughout async code
async function submitForm(data: FormData) {
  const handler = store.getHandler(); // Capture before async
  
  const response = await api.submit(data);
  
  // Handler operates on its own account - always safe
  handler.set('settings', response.result);
}
```

#### Level 3: Handler Validation Options

The handler can validate it's still the current account:

```typescript
interface AccountHandler<S> {
  /** The account this handler manages */
  readonly account: `0x${string}`;
  
  /** True if this handler is for the current account */
  readonly isCurrent: boolean;
  
  /** Configure behavior when mutating while not current */
  backgroundMutationBehavior: 'allow' | 'warn' | 'throw';
}

// Option A: Allow silently (data still saved, just no events to main store)
handler.backgroundMutationBehavior = 'allow';
handler.set('settings', value); // Works, saves, no main store events

// Option B: Console warning (good for development)
handler.backgroundMutationBehavior = 'warn';
handler.set('settings', value); // Console.warn('Mutation on background handler')

// Option C: Throw error (strictest)
handler.backgroundMutationBehavior = 'throw';
handler.set('settings', value); // Throws 'Cannot mutate background handler'
```

Default recommendation: `'warn'` in development, `'allow'` in production.

### API Additions to SyncableStore

```typescript
interface SyncableStore<S extends Schema> {
  // Existing simple API - operates on current account
  set<K>(field: K, value: V): void;
  patch<K>(field: K, value: DeepPartial<V>): void;
  add<K>(field: K, key: string, value: V, options: {deleteAt: number}): void;
  update<K>(field: K, key: string, value: V): void;
  remove<K>(field: K, key: string): void;
  
  // New: Handler access for async-safe operations
  
  /**
   * Get handler for current account.
   * Throws if no account is connected.
   *
   * Use this in async code to ensure mutations go to the right account:
   * ```typescript
   * const handler = store.getHandler();
   * await someAsyncWork();
   * handler.set('field', value); // Safe - uses captured account
   * ```
   */
  getHandler(): AccountHandler<S>;
  
  /**
   * Get handler for specific account.
   * Creates handler if it doesn't exist.
   *
   * Use for background operations or multi-account scenarios.
   */
  getHandlerFor(account: `0x${string}`): AccountHandler<S>;
  
  /**
   * Check if there's a current account.
   */
  readonly hasAccount: boolean;
  
  /**
   * Current account address or undefined.
   */
  readonly currentAccount: `0x${string}` | undefined;
}
```

### Example Usage Patterns

#### Pattern 1: Form Submission

```typescript
async function onSubmit(formData: FormData) {
  const handler = store.getHandler(); // Capture before async
  
  try {
    const result = await api.submitForm(formData);
    handler.set('formResult', result);
  } catch (error) {
    handler.set('formError', error.message);
  }
}
```

#### Pattern 2: Long-Running Operation with Early Exit

```typescript
async function processItems(items: Item[]) {
  const handler = store.getHandler();
  
  for (const item of items) {
    await processItem(item);
    handler.update('items', item.id, {processed: true});
    
    // Optional: Check if still current and bail if user switched
    if (!handler.isCurrent) {
      console.log('User switched accounts, stopping background work');
      return;
    }
  }
}
```

#### Pattern 3: WebSocket or Callback-Based APIs

```typescript
function setupWebSocket() {
  const handler = store.getHandler();
  
  ws.onmessage = (event) => {
    // Handler is captured in closure - safe
    handler.update('messages', event.data.id, event.data);
  };
  
  // Clean up if account changes
  const unsubscribe = store.subscribe((state) => {
    if (state.account !== handler.account) {
      ws.close();
      unsubscribe();
    }
  });
}
```

#### Pattern 4: Multi-Account Operations (Advanced)

```typescript
async function syncAllAccounts(accounts: `0x${string}`[]) {
  for (const account of accounts) {
    const handler = store.getHandlerFor(account);
    await handler.syncNow();
  }
}
```

### Test Cases for Async Safety

```typescript
describe('Async Application Code Safety', () => {
  it('should allow mutations on captured handler after account switch', async () => {
    const handlerA = store.getHandler(); // Account A
    
    accountStore.setAccount('0xB');
    await waitForReady(store);
    
    // handlerA still works - writes to A's storage
    handlerA.set('settings', {value: 1});
    
    // Verify A's data was updated
    expect(handlers.get('0xA').asyncState.data.settings).toEqual({value: 1});
    
    // B's data unaffected
    expect(store.state.data.settings).not.toEqual({value: 1});
  });
  
  it('should report isCurrent correctly', async () => {
    const handlerA = store.getHandler();
    expect(handlerA.isCurrent).toBe(true);
    
    accountStore.setAccount('0xB');
    await waitForReady(store);
    
    expect(handlerA.isCurrent).toBe(false);
  });
  
  it('should warn on background mutation when configured', async () => {
    const handlerA = store.getHandler();
    handlerA.backgroundMutationBehavior = 'warn';
    
    accountStore.setAccount('0xB');
    await waitForReady(store);
    
    const warnSpy = vi.spyOn(console, 'warn');
    handlerA.set('settings', {value: 1});
    
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('background handler')
    );
  });
  
  it('should throw on background mutation when configured', async () => {
    const handlerA = store.getHandler();
    handlerA.backgroundMutationBehavior = 'throw';
    
    accountStore.setAccount('0xB');
    await waitForReady(store);
    
    expect(() => handlerA.set('settings', {value: 1}))
      .toThrow('Cannot mutate background handler');
  });
});
```

---

## Open Questions

1. **Handler cache strategy?**
   - Keep all until page reload (simple, more memory)?
   - LRU cache with max size (complex, controlled memory)?
   - Dispose immediately after work completes (simple, slower switch-back)?

2. **Background error notifications?**
   - Should we notify when background handler has error?
   - Or only show errors when user switches back to that account?

3. **Background mutation default behavior?**
   - `'allow'` - silently work (most forgiving)
   - `'warn'` - console warning (good for development)
   - `'throw'` - strict mode (catches bugs early)
   
4. **Should getHandler() be the primary API?**
   - Make handler-based access the default pattern?
   - Or keep store.set() as primary with handler as escape hatch?
