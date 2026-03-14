# Multi-Account Data Manager

## Goal

Design a higher-level manager that handles multi-account switching on top of the simplified single-account `SyncableStore`. This separates concerns:

- **SyncableStore**: Single-account data management (no account switching logic)
- **CurrentAccountDataStore**: Multi-account lifecycle management, exposes the "current" store

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CurrentAccountDataStore                                        │
│                                                                  │
│  Subscribes to AccountStore ──────────────────────────────────┐ │
│  Creates/destroys SyncableStore instances                      │ │
│  Manages "current" store reference                             │ │
│  Guards against race conditions during account switch          │ │
│                                                                  │
│  API:                                                            │
│    subscribe(cb) → Svelte store contract                        │
│    get() → Synchronous access to current store                  │
│    start() → Begin listening to account changes                 │
│    stop() → Stop listening, cleanup current store               │
│                                                                  │
└───────────────────┬─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  SyncableStore (per account)                                     │
│                                                                  │
│  Bound to ONE specific account                                   │
│  storageKey is a string                                          │
│  No account switching logic                                      │
│  Explicit load() call                                            │
│                                                                  │
│  States: idle → loading → ready                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Store Reference as Feature, Not Bug

When `.get()` returns a store reference, it captures that specific account's store. This is intentional:

```typescript
// User is on Account A
const accountDataA = currentAccountData.get();

// Start async operation
const result = await someAsyncWork();

// User switched to Account B during the async work
// accountDataA is STILL Account A's store - CORRECT!
accountDataA.set('result', result); // Writes to Account A, not B
```

This "actor model" pattern ensures operations complete on the intended target, preventing silent data corruption.

### 2. Race Condition Handling at Manager Level

The single-account store no longer handles race conditions (no `loadGeneration`). The manager handles this with a `pendingAccount` guard:

```typescript
let pendingAccount: `0x${string}` | undefined;

accountStore.subscribe(async (account) => {
  pendingAccount = account;
  
  currentStore?.stop();
  currentStore = null;
  notify(); // Immediately notify that store is changing
  
  if (account) {
    const store = createSyncableStore({ account, storageKey: `data-${account}`, ... });
    await store.load();
    
    // Guard: only set if still the intended account
    if (pendingAccount === account) {
      currentStore = store;
      notify();
    } else {
      // Account changed during load - cleanup orphan store
      store.stop();
    }
  }
});
```

### 3. Null/Undefined States During Transition

Components must handle transitional states:

```svelte
<script lang="ts">
  let operations = $derived($currentAccountData?.getFieldStore('operations'));
</script>

{#if $currentAccountData?.state.status === 'ready' && operations}
  {#each $operations as operation}
    ...
  {/each}
{:else if $currentAccountData?.state.status === 'loading'}
  <LoadingSpinner />
{:else}
  <ConnectPrompt />
{/if}
```

## Interface Design

### CurrentAccountDataStore Interface

```typescript
import type { SyncableStore, Schema } from './createSyncableStore';
import type { AccountStore } from './types';

/**
 * Configuration for creating a multi-account data manager.
 * Omits account-specific fields that the manager controls.
 */
export interface CurrentAccountDataConfig<S extends Schema> 
  extends Omit<SyncableStoreConfig<S>, 'account' | 'storageKey'> {
  
  /** Account store to subscribe to */
  accountStore: AccountStore;
  
  /** Storage key generator from account address */
  storageKeyPrefix: string;
}

/**
 * Multi-account data manager that wraps single-account SyncableStores.
 */
export interface CurrentAccountDataStore<S extends Schema> {
  /**
   * Svelte store contract - subscribe to current store changes.
   * Value is null when no account connected or during transition.
   */
  subscribe(callback: (store: SyncableStore<S> | null) => void): () => void;
  
  /**
   * Synchronous access to current store.
   * Returns null when no account connected.
   *
   * IMPORTANT: Captured reference remains valid even after account switch.
   * This is intentional for async operation safety.
   */
  get(): SyncableStore<S> | null;
  
  /**
   * Get the current account address (if any).
   */
  readonly currentAccount: `0x${string}` | undefined;
  
  /**
   * Start listening to account store changes.
   * Creates/loads store for current account if connected.
   * Returns cleanup function (same as calling stop()).
   */
  start(): () => void;
  
  /**
   * Stop listening to account store, cleanup current store.
   */
  stop(): void;
}
```

## Implementation

```typescript
import { createSyncableStore, type SyncableStore, type Schema } from './createSyncableStore';
import type { AccountStore } from './types';

export function createCurrentAccountDataStore<S extends Schema>(
  config: CurrentAccountDataConfig<S>
): CurrentAccountDataStore<S> {
  const { accountStore, storageKeyPrefix, ...storeConfig } = config;
  
  // State
  let currentStore: SyncableStore<S> | null = null;
  let currentAccount: `0x${string}` | undefined;
  let pendingAccount: `0x${string}` | undefined;
  let unsubscribeAccount: (() => void) | undefined;
  
  // Subscribers
  const subscribers = new Set<(store: SyncableStore<S> | null) => void>();
  
  function notify(): void {
    for (const callback of subscribers) {
      callback(currentStore);
    }
  }
  
  // Handle account changes
  async function handleAccountChange(account: `0x${string}` | undefined): Promise<void> {
    // Track which account we're switching to
    pendingAccount = account;
    currentAccount = account;
    
    // Stop and cleanup previous store
    if (currentStore) {
      currentStore.stop();
      currentStore = null;
      notify(); // Notify immediately that store is null/transitioning
    }
    
    // No account - stay null
    if (!account) {
      return;
    }
    
    // Create new store for this account
    const store = createSyncableStore({
      ...storeConfig,
      account,
      storageKey: `${storageKeyPrefix}${account}`,
    });
    
    try {
      // Load the store (async)
      await store.load();
      
      // Race condition guard: only set if still the intended account
      if (pendingAccount === account) {
        currentStore = store;
        notify();
      } else {
        // Account changed during load - cleanup orphan store
        store.stop();
      }
    } catch (error) {
      // Load failed - cleanup
      store.stop();
      
      // Only notify if still the intended account
      if (pendingAccount === account) {
        // Could emit error event here if needed
        console.error('Failed to load account data:', error);
      }
    }
  }
  
  return {
    subscribe(callback: (store: SyncableStore<S> | null) => void): () => void {
      subscribers.add(callback);
      callback(currentStore); // Svelte store contract: call immediately
      return () => subscribers.delete(callback);
    },
    
    get(): SyncableStore<S> | null {
      return currentStore;
    },
    
    get currentAccount(): `0x${string}` | undefined {
      return currentAccount;
    },
    
    start(): () => void {
      // Already started - no-op
      if (unsubscribeAccount) {
        return () => this.stop();
      }
      
      // Subscribe to account changes
      unsubscribeAccount = accountStore.subscribe((account) => {
        handleAccountChange(account);
      });
      
      return () => this.stop();
    },
    
    stop(): void {
      unsubscribeAccount?.();
      unsubscribeAccount = undefined;
      currentStore?.stop();
      currentStore = null;
      currentAccount = undefined;
      pendingAccount = undefined;
      notify();
    },
  };
}
```

## Usage Examples

### Basic Usage

```typescript
import { createCurrentAccountDataStore } from '$lib/core/sync';
import { accountStore } from '$lib/context';

const currentAccountData = createCurrentAccountDataStore({
  accountStore,
  storageKeyPrefix: 'app-data-',
  schema: mySchema,
  storage: myStorage,
  defaultData: () => ({ operations: {} }),
  sync: mySyncAdapter,
});

// Start listening to account changes
currentAccountData.start();

// Later, when cleaning up (e.g., component unmount, app shutdown)
currentAccountData.stop();
```

### In Svelte Components

```svelte
<script lang="ts">
  import { currentAccountData } from '$lib/context';
  
  // Get the current store (reactive)
  let accountStore = $currentAccountData;
  
  // Derived field stores (re-evaluate when accountStore changes)
  let operations = $derived(accountStore?.getFieldStore('operations'));
</script>

{#if accountStore?.state.status === 'ready'}
  {#if operations}
    {#each Object.entries($operations ?? {}) as [id, op]}
      <OperationCard operation={op} />
    {/each}
  {/if}
{:else if accountStore?.state.status === 'loading'}
  <p>Loading account data...</p>
{:else}
  <p>Connect your wallet to continue</p>
{/if}
```

### Imperative Usage (Actions, Event Handlers)

```typescript
// In an action or event handler
async function submitTransaction() {
  // Capture reference at start of operation
  const store = currentAccountData.get();
  if (!store || store.state.status !== 'ready') {
    throw new Error('No account connected');
  }
  
  // Start async work
  const result = await sendTransaction(...);
  
  // Safe to use captured reference - writes to correct account
  // even if user switched accounts during transaction
  store.add('operations', result.id, {
    hash: result.hash,
    status: 'pending',
  }, { deleteAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
}
```

## Migration from Current AccountData

### Current Implementation (AccountData.ts)

The current [`AccountData.ts`](web/src/lib/account/AccountData.ts) uses `createAccountStore` which handles multi-account internally.

### Migration Steps

1. **Update createSyncableStore** per `single-account-syncable-store.md` plan
2. **Create createCurrentAccountDataStore** as described above
3. **Update AccountData.ts** to use the new pattern:

```typescript
// Before
export function createAccountData(params: {
  account: AccountStore;
  deployments: TypedDeployments;
  storage?: AsyncStorage<AccountData>;
}) {
  const store = createAccountStore<AccountData, Events, typeof mutations>({
    account,
    storage,
    storageKey: (addr) => `__private__${...}_${addr}`,
    defaultData: () => ({operations: {}}),
    onClear: () => [...],
    onLoad: (data) => [...],
    mutations,
  });
  // ...
}

// After
export function createAccountData(params: {
  accountStore: AccountStore;
  deployments: TypedDeployments;
  storage?: AsyncStorage<InternalStorage<typeof accountSchema>>;
}) {
  const currentAccountData = createCurrentAccountDataStore({
    accountStore: params.accountStore,
    storageKeyPrefix: `__private__${params.deployments.chain.id}_${...}_`,
    schema: accountSchema,
    storage: params.storage ?? createLocalStorageAdapter(),
    defaultData: () => ({operations: {}}),
  });
  
  return currentAccountData;
}
```

## State Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   CurrentAccountDataStore                        │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ account  │        │ account  │        │ account  │
   │   null   │───────▶│   set    │───────▶│ switched │
   │          │        │          │        │          │
   │ store:   │        │ store:   │        │ store:   │
   │  null    │        │ loading  │        │  null    │──┐
   └──────────┘        │ → ready  │        └──────────┘  │
                       └──────────┘                      │
                              ▲                          │
                              └──────────────────────────┘
```

## Benefits

1. **Separation of Concerns**
   - SyncableStore: Pure single-account data management
   - CurrentAccountDataStore: Account lifecycle orchestration

2. **Simpler SyncableStore**
   - No `loadGeneration` race handling
   - No account subscription
   - Explicit `load()` lifecycle
   - Easier to test

3. **Actor Model Safety**
   - Captured store references remain valid
   - Async operations write to intended account
   - No silent data corruption

4. **Clear State Transitions**
   - `null` → Store is transitioning or no account
   - `loading` → Store is loading data
   - `ready` → Safe to read/write

5. **Testability**
   - SyncableStore can be tested in isolation with static account
   - CurrentAccountDataStore can be tested with mock AccountStore

## Checklist

- [ ] Implement single-account SyncableStore changes (see `single-account-syncable-store.md`)
- [ ] Create `createCurrentAccountDataStore` function
- [ ] Add `CurrentAccountDataStore` interface and types
- [ ] Migrate `AccountData.ts` to use new pattern
- [ ] Update context providers
- [ ] Update components to handle null/transitional states
- [ ] Add tests for race condition handling
- [ ] Add tests for store capture safety
- [ ] Update documentation
