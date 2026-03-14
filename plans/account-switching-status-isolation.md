# Account Switching Status Isolation

## Problem Analysis

When users switch accounts in `createSyncableStore.ts`, errors and status flags from the previous account are incorrectly shown to the new account. This creates confusion and incorrect UI states.

### Current Architecture Issues

#### 1. Global Singleton Status Objects

The status objects at lines 266-296 are singleton/global:

```typescript
// These are NOT per-account
const mutableSyncStatus: MutableSyncStatus = {
  isSyncing: false,
  syncError: null,  // ← Shows previous account's error to new account
  // ...
};

const mutableStorageStatus: MutableStorageStatus = {
  isSaving: false,
  storageError: null,  // ← Shows previous account's error to new account
  // ...
};
```

#### 2. Async Operations Don't Check Account Validity

When async operations complete, they update global status without verifying the account is still current:

**[`doStorageSave`](web/src/lib/core/sync/createSyncableStore.ts:550)** - Storage save error handling:
```typescript
async function doStorageSave(account, data) {
  try {
    await storage.save(storageKey(account), data);
    mutableStorageStatus.lastSavedAt = clock();  // Global update - no account check
  } catch (error) {
    mutableStorageStatus.storageError = error;   // Global error - wrong account!
    emitStorageEvent({type: 'failed', error});
  }
}
```

**[`performSync`](web/src/lib/core/sync/createSyncableStore.ts:416)** - Sync error handling:
```typescript
async function performSync() {
  // Uses asyncState.account which IS updated on switch
  // But errors are stored globally
  try {
    // ... sync logic
  } catch (error) {
    mutableSyncStatus.syncError = error;  // Global - could be wrong account
    emitSyncEvent({type: 'failed', error});
  }
}
```

### Race Condition Scenarios

#### Scenario 1: Storage Save Error After Account Switch

```
Timeline:
1. Account A makes a change → saveToStorage(A, data) starts
2. User switches to Account B
3. Account A's save fails → mutableStorageStatus.storageError = error
4. Account B sees Account A's error in UI
```

#### Scenario 2: Sync Error After Account Switch

```
Timeline:
1. Account A triggers performSync()
2. User switches to Account B
3. performSync() for A is still running (no cancellation)
4. Sync fails → mutableSyncStatus.syncError = error
5. Account B sees "sync failed" even though B never synced
```

#### Scenario 3: isSaving Flag Persists

```
Timeline:
1. Account A starts saving → isSaving = true
2. User switches to Account B (fast)
3. Account B loads → user sees "Saving..." indicator
4. Account A's save completes → isSaving = false
5. But if A's save is slow, B shows "Saving..." incorrectly
```

### What's Already Working

1. **`loadGeneration`** pattern (line 237, 669-677): Correctly ignores stale async load results
2. **Fresh data objects**: On account switch, new `internalStorage` is created, so in-flight operations don't corrupt new account's data
3. **Account parameter in storage**: `saveToStorage(account, data)` correctly saves to account-specific keys

---

## Proposed Architecture

### Design Principles

1. **Errors are valuable history** - Keep per-account error registry
2. **Status flags are ephemeral** - Reset on account switch  
3. **Operations validate account** - Check account is still current before updating status
4. **Simple accessor for current account** - Easy UI access to current account's state

### Solution Overview

```typescript
// Per-account error registry
const accountErrors: Map<`0x${string}`, {
  storageError: Error | null;
  syncError: Error | null;
}> = new Map();

// Current account status (reset on switch)
let currentAccountStatus: {
  isSaving: boolean;
  isSyncing: boolean;
  isPaused: boolean;
  isOnline: boolean;
  hasPendingSync: boolean;
  lastSavedAt: number | null;
  lastSyncedAt: number | null;
} = createDefaultStatus();
```

### Type Changes

#### New Error Types in `types.ts`

```typescript
/**
 * Per-account error record.
 * Errors are preserved per-account so switching back shows the error.
 */
export interface AccountErrors {
  readonly storageError: Error | null;
  readonly syncError: Error | null;
}

/**
 * Enhanced SyncStatus with per-account error awareness.
 */
export interface SyncStatus {
  readonly isSyncing: boolean;
  readonly isOnline: boolean;
  readonly isPaused: boolean;
  readonly hasPendingSync: boolean;
  readonly lastSyncedAt: number | null;
  
  /** Current account's sync error (from error registry) */
  readonly syncError: Error | null;
  
  /** Access errors for any account */
  readonly getErrorForAccount: (account: `0x${string}`) => Error | null;
  
  readonly displayState: 'syncing' | 'offline' | 'paused' | 'error' | 'idle';
}

/**
 * Enhanced StorageStatus with per-account error awareness.
 */
export interface StorageStatus {
  readonly isSaving: boolean;
  readonly lastSavedAt: number | null;
  
  /** Current account's storage error (from error registry) */
  readonly storageError: Error | null;
  
  /** Access errors for any account */
  readonly getErrorForAccount: (account: `0x${string}`) => Error | null;
  
  readonly displayState: 'saving' | 'error' | 'idle';
}
```

### Implementation Changes in `createSyncableStore.ts`

#### 1. Add Per-Account Error Registry

```typescript
// Error registry - persists across account switches
const storageErrorsByAccount = new Map<`0x${string}`, Error | null>();
const syncErrorsByAccount = new Map<`0x${string}`, Error | null>();

// Helper to get/set errors for an account
function getStorageError(account: `0x${string}` | undefined): Error | null {
  return account ? (storageErrorsByAccount.get(account) ?? null) : null;
}

function setStorageError(account: `0x${string}`, error: Error | null): void {
  if (error === null) {
    storageErrorsByAccount.delete(account);
  } else {
    storageErrorsByAccount.set(account, error);
  }
}

function getSyncError(account: `0x${string}` | undefined): Error | null {
  return account ? (syncErrorsByAccount.get(account) ?? null) : null;
}

function setSyncError(account: `0x${string}`, error: Error | null): void {
  if (error === null) {
    syncErrorsByAccount.delete(account);
  } else {
    syncErrorsByAccount.set(account, error);
  }
}
```

#### 2. Modify Status Objects to Use Registry

```typescript
const mutableSyncStatus: MutableSyncStatus = {
  isSyncing: false,
  isOnline: true,
  isPaused: false,
  hasPendingSync: false,
  lastSyncedAt: null,
  
  get syncError() {
    return getSyncError(asyncState.account);
  },
  
  getErrorForAccount(account: `0x${string}`) {
    return getSyncError(account);
  },
  
  get displayState() {
    if (this.isSyncing) return 'syncing';
    if (!this.isOnline) return 'offline';
    if (this.isPaused) return 'paused';
    if (this.syncError) return 'error';
    return 'idle';
  },
};

const mutableStorageStatus: MutableStorageStatus = {
  isSaving: false,
  lastSavedAt: null,
  
  get storageError() {
    return getStorageError(asyncState.account);
  },
  
  getErrorForAccount(account: `0x${string}`) {
    return getStorageError(account);
  },
  
  get displayState() {
    if (this.isSaving) return 'saving';
    if (this.storageError) return 'error';
    return 'idle';
  },
};
```

#### 3. Reset Status on Account Switch

In [`setAccount`](web/src/lib/core/sync/createSyncableStore.ts:640):

```typescript
async function setAccount(newAccount: `0x${string}` | undefined): Promise<void> {
  if (newAccount === asyncState.account) return;

  // Clean up previous watch
  unwatchStorage?.();
  unwatchStorage = undefined;

  // Clear caches
  itemStoreCache.clear();
  fieldStoreCache.clear();

  // *** NEW: Reset ephemeral status on account switch ***
  mutableSyncStatus.isSyncing = false;
  mutableSyncStatus.hasPendingSync = false;
  mutableSyncStatus.lastSyncedAt = null;
  // Note: syncError comes from registry, auto-switches to new account
  
  mutableStorageStatus.isSaving = false;
  mutableStorageStatus.lastSavedAt = null;
  // Note: storageError comes from registry, auto-switches to new account
  
  // Cancel any pending sync debounce
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = undefined;
  }
  syncDirty = false;

  // ... rest of setAccount
}
```

#### 4. Validate Account in Async Completions

In [`doStorageSave`](web/src/lib/core/sync/createSyncableStore.ts:550):

```typescript
async function doStorageSave(
  account: `0x${string}`,
  data: InternalStorage<S>,
): Promise<void> {
  try {
    await storage.save(storageKey(account), data);
    
    // Only update status if this account is still current
    if (asyncState.account === account) {
      mutableStorageStatus.lastSavedAt = clock();
    }
  } catch (error) {
    // Always record error for the account it belongs to
    setStorageError(account, error as Error);
    
    // Only emit event if this account is still current
    if (asyncState.account === account) {
      emitStorageEvent({type: 'failed', error: error as Error});
    }
    throw error;
  }
}
```

In [`processStorageSave`](web/src/lib/core/sync/createSyncableStore.ts:569):

```typescript
async function processStorageSave(
  account: `0x${string}`,
  data: InternalStorage<S>,
): Promise<void> {
  try {
    await doStorageSave(account, data);
  } catch {
    // Error handled in doStorageSave
  }

  if (storageSavePending) {
    const pending = storageSavePending;
    storageSavePending = null;

    // Only clear error/emit events if current account
    if (asyncState.account === pending.account) {
      setStorageError(pending.account, null);
      emitStorageEvent({type: 'saving'});
    }

    await processStorageSave(pending.account, pending.data);
  } else {
    // Only update isSaving if we're still the current account
    if (asyncState.account === account) {
      mutableStorageStatus.isSaving = false;
      emitStorageEvent({
        type: 'saved',
        timestamp: mutableStorageStatus.lastSavedAt ?? clock(),
      });
    }
  }
}
```

In [`performSync`](web/src/lib/core/sync/createSyncableStore.ts:416):

```typescript
async function performSync(retryCount = 0): Promise<void> {
  if (!syncAdapter || !internalStorage || asyncState.status !== 'ready') return;

  // Capture account at start of sync
  const syncAccount = asyncState.account;
  
  const isCurrentAccount = () => asyncState.account === syncAccount;

  try {
    if (isCurrentAccount()) {
      mutableSyncStatus.isSyncing = true;
      setSyncError(syncAccount, null);
    }
    
    if (retryCount === 0 && isCurrentAccount()) {
      emitSyncEvent({type: 'started'});
    }

    // ... pull/merge/push logic (uses syncAccount, not asyncState.account)
    
    const pullResponse = await syncAdapter.pull(syncAccount);
    
    // Check if still current after async operation
    if (!isCurrentAccount()) return;
    
    // ... continue with merge and push
    
    // On success
    if (isCurrentAccount()) {
      syncDirty = false;
      mutableSyncStatus.lastSyncedAt = clock();
      mutableSyncStatus.hasPendingSync = false;
      mutableSyncStatus.isSyncing = false;
      emitSyncEvent({type: 'completed', timestamp: clock()});
    }
  } catch (error) {
    // Always record error for the account
    setSyncError(syncAccount, error as Error);
    
    // Only update status/emit if still current
    if (isCurrentAccount()) {
      if (retryCount < maxRetries) {
        const backoffDelay = retryBackoffMs * Math.pow(2, retryCount);
        setTimeout(() => performSync(retryCount + 1), backoffDelay);
      } else {
        mutableSyncStatus.isSyncing = false;
        emitSyncEvent({type: 'failed', error: error as Error});
      }
    }
  }
}
```

---

## Test Plan

### Test File Location

`web/test/lib/core/sync/account-switching.test.ts`

### Test Utilities

```typescript
// Mock storage adapter
function createMockStorage() {
  const store = new Map<string, unknown>();
  let saveDelay = 0;
  let shouldFail = false;
  let failError = new Error('Storage failed');
  
  return {
    async load(key: string) {
      return store.get(key) ?? null;
    },
    async save(key: string, data: unknown) {
      await new Promise(r => setTimeout(r, saveDelay));
      if (shouldFail) throw failError;
      store.set(key, data);
    },
    setSaveDelay(ms: number) { saveDelay = ms; },
    setFailure(fail: boolean, error?: Error) {
      shouldFail = fail;
      if (error) failError = error;
    },
  };
}

// Mock account store
function createMockAccountStore() {
  let account: `0x${string}` | undefined = undefined;
  const subscribers = new Set<(a: typeof account) => void>();
  
  return {
    get current() { return account; },
    subscribe(cb: (a: typeof account) => void) {
      subscribers.add(cb);
      cb(account);
      return () => subscribers.delete(cb);
    },
    setAccount(a: typeof account) {
      account = a;
      subscribers.forEach(cb => cb(account));
    },
  };
}

// Mock sync adapter
function createMockSyncAdapter<S extends Schema>() {
  let pullDelay = 0;
  let shouldFail = false;
  let data: InternalStorage<S> | null = null;
  let counter = 0n;
  
  return {
    async pull(account: `0x${string}`) {
      await new Promise(r => setTimeout(r, pullDelay));
      if (shouldFail) throw new Error('Sync failed');
      return { data, counter };
    },
    async push(account: `0x${string}`, d: InternalStorage<S>, c: bigint) {
      if (shouldFail) throw new Error('Push failed');
      data = d;
      counter = c;
      return { success: true };
    },
    setPullDelay(ms: number) { pullDelay = ms; },
    setFailure(fail: boolean) { shouldFail = fail; },
  };
}
```

### Test Cases

#### 1. Storage Error Attribution

```typescript
describe('Storage Error Attribution', () => {
  it('should attribute storage error to correct account after switch', async () => {
    const storage = createMockStorage();
    const accountStore = createMockAccountStore();
    const store = createSyncableStore({ storage, account: accountStore, ... });
    
    store.start();
    
    // Account A makes a change
    accountStore.setAccount('0xAccountA');
    await waitForReady(store);
    
    // Set up slow failing save
    storage.setSaveDelay(100);
    storage.setFailure(true, new Error('A storage error'));
    
    store.set('settings', { value: 1 });
    
    // Quickly switch to account B
    accountStore.setAccount('0xAccountB');
    await waitForReady(store);
    
    // Wait for A's save to fail
    await new Promise(r => setTimeout(r, 150));
    
    // B should NOT see A's error as current
    expect(store.storageStatusStore.storageError).toBeNull();
    
    // But A's error should be in registry
    expect(store.storageStatusStore.getErrorForAccount('0xAccountA'))
      .toEqual(new Error('A storage error'));
  });
  
  it('should show correct error when switching back to failed account', async () => {
    // ... same setup ...
    
    // Switch back to A
    accountStore.setAccount('0xAccountA');
    await waitForReady(store);
    
    // Now should see A's error
    expect(store.storageStatusStore.storageError)
      .toEqual(new Error('A storage error'));
  });
});
```

#### 2. Sync Error Attribution

```typescript
describe('Sync Error Attribution', () => {
  it('should attribute sync error to correct account after switch', async () => {
    const syncAdapter = createMockSyncAdapter();
    const accountStore = createMockAccountStore();
    const store = createSyncableStore({ sync: syncAdapter, account: accountStore, ... });
    
    store.start();
    
    accountStore.setAccount('0xAccountA');
    await waitForReady(store);
    
    // Set up slow failing sync
    syncAdapter.setPullDelay(100);
    syncAdapter.setFailure(true);
    
    store.syncNow(); // Triggers sync
    
    // Quickly switch to B
    accountStore.setAccount('0xAccountB');
    await waitForReady(store);
    
    // Wait for A's sync to fail
    await new Promise(r => setTimeout(r, 150));
    
    // B should not see A's sync error
    expect(store.syncStatusStore.syncError).toBeNull();
    expect(store.syncStatusStore.displayState).not.toBe('error');
  });
});
```

#### 3. Status Reset on Switch

```typescript
describe('Status Reset on Account Switch', () => {
  it('should reset isSaving when switching accounts', async () => {
    const storage = createMockStorage();
    const accountStore = createMockAccountStore();
    const store = createSyncableStore({ storage, account: accountStore, ... });
    
    store.start();
    accountStore.setAccount('0xAccountA');
    await waitForReady(store);
    
    // Start a slow save
    storage.setSaveDelay(1000);
    store.set('settings', { value: 1 });
    
    expect(store.storageStatusStore.isSaving).toBe(true);
    
    // Switch to B
    accountStore.setAccount('0xAccountB');
    await waitForReady(store);
    
    // B should not see "saving" state
    expect(store.storageStatusStore.isSaving).toBe(false);
  });
  
  it('should reset isSyncing when switching accounts', async () => {
    // Similar test for sync status
  });
  
  it('should reset hasPendingSync when switching accounts', async () => {
    // ...
  });
  
  it('should cancel debounced sync when switching accounts', async () => {
    // ...
  });
});
```

#### 4. Event Emission Scoping

```typescript
describe('Event Emission Scoping', () => {
  it('should not emit storage:failed event to new account', async () => {
    // ...
    const events: StorageEvent[] = [];
    store.on('$store:storage', e => events.push(e));
    
    // A fails after B is active
    // Events should not include A's failure (or should be filtered)
  });
  
  it('should not emit sync:failed event to new account', async () => {
    // Similar
  });
});
```

#### 5. Error Registry Persistence

```typescript
describe('Error Registry Persistence', () => {
  it('should preserve errors when switching away and back', async () => {
    // A fails, switch to B, switch back to A, error still there
  });
  
  it('should clear error when operation succeeds', async () => {
    // A fails, stays on A, retry succeeds, error cleared
  });
  
  it('should maintain separate errors for each account', async () => {
    // A has storage error, B has sync error, both preserved
  });
});
```

#### 6. Data Integrity (Verification)

```typescript
describe('Data Integrity on Account Switch', () => {
  it('should not corrupt data when save completes after switch', async () => {
    // A saves, switch to B, A's save completes
    // Verify A's data saved to A's key, not B's
  });
  
  it('should not apply sync merge to wrong account', async () => {
    // A syncs, switch to B, A's sync completes with server data
    // Verify server data not applied to B
  });
});
```

---

## Implementation Checklist

### Phase 1: Type Updates
- [ ] Update `SyncStatus` interface in `types.ts`
- [ ] Update `StorageStatus` interface in `types.ts`
- [ ] Add `AccountErrors` type

### Phase 2: Error Registry
- [ ] Add `storageErrorsByAccount` Map
- [ ] Add `syncErrorsByAccount` Map
- [ ] Add helper functions for get/set errors
- [ ] Modify status object getters to use registry

### Phase 3: Status Reset on Account Switch
- [ ] Reset `isSaving`, `isSyncing`, `hasPendingSync` in `setAccount`
- [ ] Reset `lastSavedAt`, `lastSyncedAt` in `setAccount`
- [ ] Cancel pending sync debounce timer
- [ ] Clear `syncDirty` flag

### Phase 4: Account Validation in Async Operations
- [ ] Update `doStorageSave` to check current account
- [ ] Update `processStorageSave` to check current account
- [ ] Update `performSync` to capture and validate account
- [ ] Update `saveToStorage` to validate before status updates

### Phase 5: Tests
- [ ] Create test utilities (mock storage, account store, sync adapter)
- [ ] Write storage error attribution tests
- [ ] Write sync error attribution tests
- [ ] Write status reset tests
- [ ] Write event emission scoping tests
- [ ] Write error registry persistence tests
- [ ] Write data integrity verification tests

---

## Migration Notes

### Breaking Changes

1. `SyncStatus.getErrorForAccount()` - New method added
2. `StorageStatus.getErrorForAccount()` - New method added

### Non-Breaking Behavior Changes

1. `syncError` and `storageError` now return `null` immediately after account switch (previously showed old account's error)
2. `isSaving` and `isSyncing` reset to `false` on account switch (previously could show stale state)
3. Events are no longer emitted if account changed during async operation

### UI Considerations

1. Components showing errors should handle the case where error is `null` after account switch
2. Consider showing "Previous account had error: ..." notification if user switches back
3. Loading indicators will be more accurate (not showing stale "Saving..." state)
