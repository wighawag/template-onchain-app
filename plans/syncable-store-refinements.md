# Syncable Store Refinements Plan

## Overview

This document outlines refinements needed for the Simple Syncable Store implementation based on review feedback. All changes must follow TDD methodology (write failing test first).

---

## 1. Type-Safe Events with `radiate` Library

### Current State
The current implementation uses a hand-rolled event emitter with no type safety:

```typescript
// Current - NOT type-safe
on<E extends string>(event: E, callback: (data: unknown) => void): () => void;
```

### Target State
Use `radiate` library's `createEmitter` for type-safe events with autocomplete:

```typescript
// Target - Type-safe with autocomplete
on<E extends keyof StoreEvents<S>>(event: E, callback: (data: StoreEvents<S>[E]) => void): () => void;
```

### Reference Implementation
See [`web/src/lib/core/account/createAccountStore.ts`](web/src/lib/core/account/createAccountStore.ts:4) for how `createEmitter` is used.

### Changes Required

#### 1.1 Define Type-Safe Event Map in `types.ts`

Create a type that generates event names and their payloads based on the schema:

```typescript
/**
 * Generate event types from schema.
 * For a schema with `settings: permanent<T>()` and `operations: map<U>()`:
 * 
 * {
 *   state: AsyncState<DataOf<S>>;
 *   'settings:changed': T;
 *   'operations:added': { key: string; item: U & { deleteAt: number } };
 *   'operations:updated': { key: string; item: U & { deleteAt: number } };
 *   'operations:removed': { key: string; item: U & { deleteAt: number } };
 *   sync: SyncEvent;
 * }
 */
export type StoreEvents<S extends Schema> = {
  state: AsyncState<DataOf<S>>;
  sync: SyncEvent;
} & PermanentEvents<S> & MapEvents<S>;

// Helper types to build event map
type PermanentEvents<S extends Schema> = {
  [K in PermanentKeys<S> as `${K & string}:changed`]: ExtractPermanent<S[K]>;
};

type MapEvents<S extends Schema> = {
  [K in MapKeys<S> as `${K & string}:added`]: { key: string; item: ExtractMapItem<S[K]> & { deleteAt: number } };
} & {
  [K in MapKeys<S> as `${K & string}:updated`]: { key: string; item: ExtractMapItem<S[K]> & { deleteAt: number } };
} & {
  [K in MapKeys<S> as `${K & string}:removed`]: { key: string; item: ExtractMapItem<S[K]> & { deleteAt: number } };
};
```

#### 1.2 Update `createSyncableStore.ts` to Use `radiate`

Replace the hand-rolled emitter with `createEmitter`:

```typescript
import { createEmitter } from 'radiate';

// Inside createSyncableStore:
const emitter = createEmitter<StoreEvents<S>>();

// Expose typed on/off methods
return {
  // ...other methods
  on: emitter.on.bind(emitter),
  off: emitter.off.bind(emitter),
};
```

#### 1.3 Update Store Interface

```typescript
export interface SyncableStore<S extends Schema> {
  // ... existing methods ...
  
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
}
```

### TDD Test Cases

```typescript
describe('type-safe events', () => {
  it('emits state event with AsyncState payload', async () => {
    const events: AsyncState<DataOf<TestSchema>>[] = [];
    store.on('state', (state) => events.push(state));
    
    accountStore.set('0x123...');
    await flushPromises();
    
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].status).toBe('ready');
  });

  it('emits settings:changed event when permanent field is set', async () => {
    let receivedValue: { theme: string; volume: number } | undefined;
    store.on('settings:changed', (value) => {
      receivedValue = value;
    });
    
    store.set('settings', { theme: 'light', volume: 0.9 });
    
    expect(receivedValue).toEqual({ theme: 'light', volume: 0.9 });
  });

  it('emits operations:added event when item is added', async () => {
    let receivedEvent: { key: string; item: any } | undefined;
    store.on('operations:added', (event) => {
      receivedEvent = event;
    });
    
    store.add('operations', 'op-1', { tx: '0xabc', status: 'pending' }, { deleteAt: 9999 });
    
    expect(receivedEvent?.key).toBe('op-1');
    expect(receivedEvent?.item.tx).toBe('0xabc');
  });

  it('emits operations:updated event when item is updated', async () => {
    let receivedEvent: { key: string; item: any } | undefined;
    store.on('operations:updated', (event) => {
      receivedEvent = event;
    });
    
    store.add('operations', 'op-1', { tx: '0xabc', status: 'pending' }, { deleteAt: 9999 });
    store.update('operations', 'op-1', { tx: '0xabc', status: 'confirmed' });
    
    expect(receivedEvent?.key).toBe('op-1');
    expect(receivedEvent?.item.status).toBe('confirmed');
  });

  it('emits operations:removed event when item is removed', async () => {
    let receivedEvent: { key: string; item: any } | undefined;
    store.on('operations:removed', (event) => {
      receivedEvent = event;
    });
    
    store.add('operations', 'op-1', { tx: '0xabc', status: 'pending' }, { deleteAt: 9999 });
    store.remove('operations', 'op-1');
    
    expect(receivedEvent?.key).toBe('op-1');
  });
});
```

---

## 2. Server Sync Implementation

### Current State
Server sync is described in the design document but not implemented. The store currently only supports local storage persistence and cross-tab sync.

### Target State
Implement server sync with:
- `SyncAdapter` interface for push/pull/subscribe
- `SyncManager` class for sync lifecycle management
- Debounced sync after changes
- Retry logic with exponential backoff
- Online/offline detection

### Changes Required

#### 2.1 Create `serverSync.ts`

New file with `SyncAdapter` interface and `SyncManager` class:

```typescript
/**
 * Server sync adapter interface.
 * Implement this to sync with your backend.
 */
export interface SyncAdapter<S extends Schema> {
  /**
   * Push local changes to server.
   * Returns merged state from server.
   */
  push(
    account: `0x${string}`,
    changes: InternalStorage<S>,
  ): Promise<InternalStorage<S>>;

  /**
   * Pull latest state from server.
   */
  pull(account: `0x${string}`): Promise<InternalStorage<S> | null>;

  /**
   * Subscribe to real-time updates (optional).
   */
  subscribe?(
    account: `0x${string}`,
    callback: (data: InternalStorage<S>) => void,
  ): () => void;
}

/**
 * Sync configuration.
 */
export interface SyncConfig {
  debounceMs?: number;      // Default: 1000ms
  intervalMs?: number;      // Default: 30000ms (0 to disable)
  syncOnVisible?: boolean;  // Default: true
  syncOnReconnect?: boolean; // Default: true
  maxRetries?: number;      // Default: 3
  retryBackoffMs?: number;  // Default: 1000ms
}

/**
 * Manages server synchronization lifecycle.
 */
export class SyncManager<S extends Schema> {
  // Implementation as described in the design document
}
```

#### 2.2 Update `SyncableStoreConfig` to Accept Sync Adapter

```typescript
export interface SyncableStoreConfig<S extends Schema> {
  // ... existing config ...
  
  /** Optional: Server sync adapter */
  sync?: SyncAdapter<S>;
  
  /** Optional: Sync configuration */
  syncConfig?: SyncConfig;
}
```

#### 2.3 Integrate SyncManager into createSyncableStore

When sync adapter is provided:
1. Create SyncManager instance
2. Call `markDirty()` after each mutation
3. Wire up sync events to store status
4. Handle sync during account load

### TDD Test Cases

```typescript
describe('server sync', () => {
  describe('SyncAdapter integration', () => {
    it('pulls from server on account load', async () => {
      const mockAdapter: SyncAdapter<TestSchema> = {
        pull: vi.fn().mockResolvedValue({
          $version: 1,
          data: { settings: { theme: 'server', volume: 0.7 }, operations: {} },
          $timestamps: { settings: 100 },
          $itemTimestamps: { operations: {} },
          $tombstones: { operations: {} },
        }),
        push: vi.fn().mockResolvedValue({}),
      };
      
      const store = createSyncableStore({
        schema: testSchema,
        account: accountStore,
        storage,
        storageKey: (addr) => `test-${addr}`,
        defaultData: () => ({ settings: { theme: 'dark', volume: 0.5 }, operations: {} }),
        sync: mockAdapter,
      });
      
      accountStore.set('0x123...');
      await flushPromises();
      
      expect(mockAdapter.pull).toHaveBeenCalledWith('0x123...');
    });

    it('pushes changes to server after mutation', async () => {
      const mockAdapter: SyncAdapter<TestSchema> = {
        pull: vi.fn().mockResolvedValue(null),
        push: vi.fn().mockResolvedValue(currentStorage),
      };
      
      // ... setup store with sync ...
      
      store.set('settings', { theme: 'light', volume: 0.9 });
      
      // Wait for debounce
      await new Promise(r => setTimeout(r, 1100));
      
      expect(mockAdapter.push).toHaveBeenCalled();
    });

    it('merges server response with local state', async () => {
      // Server has newer data for one field
      const mockAdapter: SyncAdapter<TestSchema> = {
        pull: vi.fn().mockResolvedValue(null),
        push: vi.fn().mockResolvedValue({
          $version: 1,
          data: { 
            settings: { theme: 'from-server', volume: 0.9 },
            operations: {} 
          },
          $timestamps: { settings: 5000 }, // Higher timestamp
          $itemTimestamps: { operations: {} },
          $tombstones: { operations: {} },
        }),
      };
      
      // ... test merge behavior ...
    });
  });

  describe('sync status', () => {
    it('updates syncState to syncing during push', async () => {
      // Test status.syncState transitions
    });

    it('emits sync event when sync completes', async () => {
      let syncEvent: SyncEvent | undefined;
      store.on('sync', (e) => { syncEvent = e; });
      
      // Trigger sync...
      
      expect(syncEvent?.type).toBe('completed');
    });

    it('sets syncState to error after max retries', async () => {
      const mockAdapter: SyncAdapter<TestSchema> = {
        pull: vi.fn().mockResolvedValue(null),
        push: vi.fn().mockRejectedValue(new Error('Network error')),
      };
      
      // ... trigger sync and wait for retries ...
      
      expect(store.status.syncState).toBe('error');
      expect(store.status.syncError?.message).toBe('Network error');
    });

    it('sets syncState to offline when navigator.onLine is false', async () => {
      // Mock navigator.onLine
    });
  });

  describe('sync lifecycle', () => {
    it('debounces rapid changes into single sync', async () => {
      const mockAdapter: SyncAdapter<TestSchema> = {
        pull: vi.fn().mockResolvedValue(null),
        push: vi.fn().mockResolvedValue(currentStorage),
      };
      
      // Make 5 rapid changes
      for (let i = 0; i < 5; i++) {
        store.set('settings', { theme: `theme-${i}`, volume: i / 10 });
      }
      
      // Wait for debounce
      await new Promise(r => setTimeout(r, 1100));
      
      // Should only push once
      expect(mockAdapter.push).toHaveBeenCalledTimes(1);
    });

    it('retries with exponential backoff', async () => {
      // Test retry timing
    });

    it('syncs when tab becomes visible', async () => {
      // Mock document.visibilityState
    });

    it('syncs when coming back online', async () => {
      // Trigger online event
    });
  });
});
```

---

## 3. Event Testing Coverage

### Current State
The current tests verify state changes but don't verify that events are emitted correctly.

### Target State
Add comprehensive event tests for all operations.

### TDD Test Cases to Add

```typescript
describe('event emission', () => {
  describe('state events', () => {
    it('emits state event on account set', async () => {
      const events: AsyncState<DataOf<TestSchema>>[] = [];
      store.on('state', (state) => events.push(state));
      
      accountStore.set('0x123...');
      await flushPromises();
      
      // Should emit: loading -> ready
      expect(events.map(e => e.status)).toEqual(['idle', 'loading', 'ready']);
    });

    it('emits state event on account clear', async () => {
      accountStore.set('0x123...');
      await flushPromises();
      
      const events: AsyncState<DataOf<TestSchema>>[] = [];
      store.on('state', (state) => events.push(state));
      
      accountStore.set(undefined);
      await flushPromises();
      
      expect(events.map(e => e.status)).toEqual(['idle']);
    });
  });

  describe('permanent field events', () => {
    it('emits :changed event on set()', async () => {
      let received: { theme: string; volume: number } | undefined;
      store.on('settings:changed', (v) => { received = v; });
      
      store.set('settings', { theme: 'light', volume: 0.8 });
      
      expect(received).toEqual({ theme: 'light', volume: 0.8 });
    });

    it('emits :changed event on patch()', async () => {
      let received: { theme: string; volume: number } | undefined;
      store.on('settings:changed', (v) => { received = v; });
      
      store.patch('settings', { volume: 0.9 });
      
      expect(received?.volume).toBe(0.9);
    });
  });

  describe('map field events', () => {
    it('emits :added event on add()', async () => {
      let received: { key: string; item: any } | undefined;
      store.on('operations:added', (e) => { received = e; });
      
      store.add('operations', 'op-1', { tx: '0xabc', status: 'pending' }, { deleteAt: 9999 });
      
      expect(received).toEqual({
        key: 'op-1',
        item: { tx: '0xabc', status: 'pending', deleteAt: 9999 },
      });
    });

    it('emits :updated event on update()', async () => {
      store.add('operations', 'op-1', { tx: '0xabc', status: 'pending' }, { deleteAt: 9999 });
      
      let received: { key: string; item: any } | undefined;
      store.on('operations:updated', (e) => { received = e; });
      
      store.update('operations', 'op-1', { tx: '0xabc', status: 'confirmed' });
      
      expect(received?.item.status).toBe('confirmed');
    });

    it('emits :removed event on remove()', async () => {
      store.add('operations', 'op-1', { tx: '0xabc', status: 'pending' }, { deleteAt: 9999 });
      
      let received: { key: string; item: any } | undefined;
      store.on('operations:removed', (e) => { received = e; });
      
      store.remove('operations', 'op-1');
      
      expect(received?.key).toBe('op-1');
    });
  });

  describe('cross-tab sync events', () => {
    it('emits events when external change is detected', async () => {
      // Setup watchable storage mock
      // Simulate external change
      // Verify events are emitted for the diff
    });
  });
});
```

---

## Implementation Order (TDD)

Following TDD methodology, implement in this order:

### Phase 1: Type-Safe Events

1. **Test**: Write failing test for typed `on('settings:changed', ...)` autocomplete/type checking
2. **Implement**: Add `StoreEvents<S>` type to `types.ts`
3. **Test**: Write failing test for event emission on set()
4. **Implement**: Integrate `radiate` createEmitter into `createSyncableStore.ts`
5. **Test**: Write failing tests for all event types (added, updated, removed, state)
6. **Implement**: Update all emit calls to use typed emitter

### Phase 2: Event Testing Coverage

7. **Test**: Add comprehensive event emission tests (state transitions)
8. **Verify**: All tests pass with typed events
9. **Test**: Add cross-tab sync event tests
10. **Implement**: Fix any issues found

### Phase 3: Server Sync

11. **Test**: Write failing test for `SyncAdapter.pull` called on account load
12. **Implement**: Create `serverSync.ts` with `SyncAdapter` interface
13. **Test**: Write failing test for `SyncAdapter.push` called after mutation
14. **Implement**: Add `SyncManager` class
15. **Test**: Write failing tests for sync status tracking
16. **Implement**: Wire up status updates
17. **Test**: Write failing tests for debounce behavior
18. **Implement**: Add debounce logic
19. **Test**: Write failing tests for retry logic
20. **Implement**: Add retry with exponential backoff
21. **Test**: Write failing tests for online/offline handling
22. **Implement**: Add visibility and online event listeners

---

## Files to Modify

| File | Changes |
|------|---------|
| `web/src/lib/core/sync/types.ts` | Add `StoreEvents<S>` type |
| `web/src/lib/core/sync/createSyncableStore.ts` | Use `radiate` createEmitter, integrate SyncManager |
| `web/src/lib/core/sync/serverSync.ts` | **NEW** - SyncAdapter interface, SyncManager class |
| `web/src/lib/core/sync/index.ts` | Export new types and classes |
| `web/test/lib/core/sync/createSyncableStore.spec.ts` | Add event and sync tests |
| `web/test/lib/core/sync/serverSync.spec.ts` | **NEW** - SyncManager unit tests |

---

## Dependencies

The `radiate` library should already be installed (used by `createAccountStore.ts`). Verify with:

```bash
cd web && pnpm list radiate
```

If not installed:
```bash
cd web && pnpm add radiate
```

---

## Success Criteria

1. ✅ `store.on('settings:changed', (value) => ...)` provides autocomplete for event names
2. ✅ Event callback parameter is correctly typed based on event name
3. ✅ All mutations emit appropriate events
4. ✅ Server sync adapter is called on account load
5. ✅ Changes are pushed to server (debounced)
6. ✅ Server response is merged with local state
7. ✅ Sync status is accurately tracked
8. ✅ Retry logic works with exponential backoff
9. ✅ All tests pass with `pnpm test:unit`
10. ✅ TypeScript check passes with `pnpm check`
