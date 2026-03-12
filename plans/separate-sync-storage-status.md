# Separate Sync and Storage Status

## Overview

Refactor the combined `StoreStatus` interface into two separate concerns:
- `SyncStatus` - Server synchronization state
- `StorageStatus` - Local storage persistence state

Additionally, simplify the event model so that:
- **Events** are pure notifications (discriminated unions with `{type: ...}`)
- **Stores** fetch current state when notified (not from event payload)

## Current State

The current `StoreStatus` combines both concerns:

```typescript
export interface StoreStatus {
    // Sync dimensions
    readonly isSyncing: boolean;
    readonly isOnline: boolean;
    readonly isPaused: boolean;
    readonly hasPendingSync: boolean;
    readonly lastSyncedAt: number | null;
    readonly syncError: Error | null;

    // Storage dimensions
    readonly pendingSaves: number;
    readonly lastSavedAt: number | null;
    readonly storageError: Error | null;

    // Combined computed getters
    readonly syncDisplayState: 'syncing' | 'offline' | 'paused' | 'error' | 'idle';
    readonly storageDisplayState: 'saving' | 'error' | 'idle';
    readonly hasError: boolean;
    readonly hasUnsavedChanges: boolean;
    readonly isBusy: boolean;
}
```

Current events:
- `$store:state` - Emits full `AsyncState<DataOf<S>>`
- `$store:status` - Emits full `StoreStatus`
- `$store:sync` - Emits `SyncEvent`

## Proposed Design

### Design Principles

1. **Events are signals** - Discriminated unions that tell you WHAT happened
2. **Stores provide state** - Subscribe to get current state when events fire
3. **No redundant events** - No separate `*Status` events; stores listen to lifecycle events

```
┌─────────────────────────────────────────────────────────────────┐
│                        Event Flow                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Mutation → Update State → Emit Event → Store Notifies          │
│                   │              │              │                │
│                   │              │              ▼                │
│                   │              │      callback(currentState)   │
│                   │              │                               │
│                   ▼              ▼                               │
│              syncStatus    {type: 'started'}                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### New Event Types

All events use consistent discriminated union pattern:

```typescript
// ============================================================================
// State Events
// ============================================================================

/**
 * State lifecycle events - emitted on async state transitions.
 */
export type StateEvent =
    | {type: 'idle'}
    | {type: 'loading'}
    | {type: 'ready'};

// ============================================================================
// Sync Events (already exists, unchanged)
// ============================================================================

/**
 * Sync lifecycle events - point-in-time notifications.
 */
export type SyncEvent =
    | {type: 'started'}
    | {type: 'completed'; timestamp: number}
    | {type: 'failed'; error: Error}
    | {type: 'offline'}
    | {type: 'online'}
    | {type: 'paused'}
    | {type: 'resumed'};

// ============================================================================
// Storage Events (new)
// ============================================================================

/**
 * Storage lifecycle events - point-in-time notifications.
 */
export type StorageEvent =
    | {type: 'saving'}
    | {type: 'saved'; timestamp: number}
    | {type: 'failed'; error: Error};
```

### New Status Types

```typescript
// ============================================================================
// Sync Status
// ============================================================================

/**
 * Sync status - server synchronization state.
 */
export interface SyncStatus {
    /** True when a sync operation is currently in progress */
    readonly isSyncing: boolean;

    /** True when network is available */
    readonly isOnline: boolean;

    /** True when sync is intentionally paused */
    readonly isPaused: boolean;

    /** True if there are changes pending sync to server */
    readonly hasPendingSync: boolean;

    /** Last successful sync timestamp */
    readonly lastSyncedAt: number | null;

    /** Last sync error, null if healthy */
    readonly syncError: Error | null;

    /** Display state for simple UI: syncing > offline > paused > error > idle */
    readonly displayState: 'syncing' | 'offline' | 'paused' | 'error' | 'idle';
}

// ============================================================================
// Storage Status
// ============================================================================

/**
 * Storage status - local persistence state.
 */
export interface StorageStatus {
    /** Number of pending saves in queue */
    readonly pendingSaves: number;

    /** Last successful save timestamp */
    readonly lastSavedAt: number | null;

    /** Last storage error, null if healthy */
    readonly storageError: Error | null;

    /** Display state for simple UI: saving > error > idle */
    readonly displayState: 'saving' | 'error' | 'idle';
}
```

### Updated Event Map

```typescript
type BaseStoreEvents<S extends Schema> = {
    '$store:state': StateEvent;      // State lifecycle signal
    '$store:sync': SyncEvent;        // Sync lifecycle signal
    '$store:storage': StorageEvent;  // Storage lifecycle signal
};
```

Note: No `$store:status`, `$store:syncStatus`, or `$store:storageStatus` events!
The stores listen to lifecycle events and fetch current state.

### Store Implementations

```typescript
// Main state store - listens to $store:state, returns AsyncState
subscribe(callback: (state: AsyncState<DataOf<S>>) => void): () => void {
    callback(asyncState);
    return emitter.on('$store:state', () => callback(asyncState));
}

// Sync status store - listens to $store:sync, returns SyncStatus
const syncStatusStore: Readable<SyncStatus> = {
    subscribe(callback) {
        callback(syncStatus);
        return emitter.on('$store:sync', () => callback(syncStatus));
    }
};

// Storage status store - listens to $store:storage, returns StorageStatus
const storageStatusStore: Readable<StorageStatus> = {
    subscribe(callback) {
        callback(storageStatus);
        return emitter.on('$store:storage', () => callback(storageStatus));
    }
};
```

### Updated Store Interface

```typescript
export interface SyncableStore<S extends Schema> {
    // ... existing methods ...

    /** Subscribe to sync status changes */
    readonly syncStatusStore: Readable<SyncStatus>;

    /** Subscribe to storage status changes */
    readonly storageStatusStore: Readable<StorageStatus>;

    // REMOVED: statusStore (combined)
}
```

### Usage Patterns

```typescript
// React to specific lifecycle events
store.on('$store:sync', (event) => {
    if (event.type === 'completed') {
        showToast('Synced!');
    }
});

store.on('$store:storage', (event) => {
    if (event.type === 'failed') {
        showError(event.error);
    }
});

// React to state changes (get full current state)
store.syncStatusStore.subscribe((status) => {
    // status is always the current SyncStatus
    updateSyncIndicator(status);
});

store.storageStatusStore.subscribe((status) => {
    // status is always the current StorageStatus
    updateSaveIndicator(status);
});
```

### Combined Status Utility (Optional)

For consumers that need combined status:

```typescript
/**
 * Combine sync and storage status for UI convenience.
 */
export function combineStatus(sync: SyncStatus, storage: StorageStatus): {
    hasError: boolean;
    hasUnsavedChanges: boolean;
    isBusy: boolean;
} {
    return {
        hasError: sync.syncError !== null || storage.storageError !== null,
        hasUnsavedChanges: storage.pendingSaves > 0,
        isBusy: sync.isSyncing || storage.pendingSaves > 0,
    };
}
```

Or in Svelte:

```svelte
<script lang="ts">
    import { derived } from 'svelte/store';
    
    const combinedStatus = derived(
        [store.syncStatusStore, store.storageStatusStore],
        ([$sync, $storage]) => ({
            hasError: $sync.syncError !== null || $storage.storageError !== null,
            isBusy: $sync.isSyncing || $storage.pendingSaves > 0,
        })
    );
</script>
```

## Implementation Steps

### 1. Update `types.ts`

1. Create `StateEvent` type (new)
2. Create `SyncStatus` interface (extract from `StoreStatus`)
3. Create `StorageStatus` interface (extract from `StoreStatus`)
4. Create `StorageEvent` type (new)
5. Update `BaseStoreEvents` to use:
   - `'$store:state': StateEvent`
   - `'$store:sync': SyncEvent`
   - `'$store:storage': StorageEvent`
6. Remove `StoreStatus` interface
7. Optionally add `combineStatus()` utility function

### 2. Update `createSyncableStore.ts`

1. Split `MutableStoreStatus` into:
   - `MutableSyncStatus`
   - `MutableStorageStatus`

2. Create separate status objects:
   ```typescript
   const mutableSyncStatus: MutableSyncStatus = { ... };
   const mutableStorageStatus: MutableStorageStatus = { ... };
   ```

3. Remove `emitStatus()` - no longer needed

4. Update event emissions to use lifecycle events:
   ```typescript
   // Before
   emitStatus();
   
   // After
   emitter.emit('$store:sync', {type: 'started'});
   ```

5. Update `subscribe()` to listen to `$store:state` and fetch `asyncState`:
   ```typescript
   subscribe(callback) {
       callback(asyncState);
       return emitter.on('$store:state', () => callback(asyncState));
   }
   ```

6. Create separate stores:
   ```typescript
   const syncStatusStore: Readable<SyncStatus> = { ... };
   const storageStatusStore: Readable<StorageStatus> = { ... };
   ```

7. Update `SyncableStore` interface:
   - Add `syncStatusStore: Readable<SyncStatus>`
   - Add `storageStatusStore: Readable<StorageStatus>`
   - Remove `statusStore`
   - Remove `status` getter (or keep for direct access?)

8. Update all mutation sites to emit appropriate events:
   - `markDirty()` → emit `$store:sync` with appropriate type
   - `performSyncPush()` → emit `$store:sync` events
   - `performSyncPull()` → emit `$store:sync` events
   - `saveToStorage()` → emit `$store:storage` events
   - `handleOnline/handleOffline` → emit `$store:sync` events
   - `pauseSync/resumeSync` → emit `$store:sync` events
   - `setAccount()` → emit `$store:state` events

### 3. Update `index.ts`

1. Export new types:
   - `StateEvent`
   - `SyncStatus`
   - `StorageStatus`
   - `StorageEvent`
2. Export `combineStatus` utility (optional)
3. Remove `StoreStatus` export

## Files to Modify

```
web/src/lib/core/sync/
├── types.ts              # Add new types, update event map
├── createSyncableStore.ts # Split status, update stores
└── index.ts              # Update exports
```

## Breaking Changes

1. `statusStore` property removed from `SyncableStore`
2. `status` getter removed from `SyncableStore`
3. `StoreStatus` type removed
4. `$store:status` event removed
5. `$store:state` event now emits `StateEvent` instead of `AsyncState`

### Migration Guide

**Before:**
```typescript
// Combined status store
store.statusStore.subscribe(status => {
    console.log(status.isSyncing, status.pendingSaves);
});

// State event with full payload
store.on('$store:state', (state) => {
    if (state.status === 'ready') { /* ... */ }
});
```

**After:**
```typescript
// Separate status stores
store.syncStatusStore.subscribe(syncStatus => {
    console.log(syncStatus.isSyncing);
});
store.storageStatusStore.subscribe(storageStatus => {
    console.log(storageStatus.pendingSaves);
});

// State event with lifecycle type
store.on('$store:state', (event) => {
    if (event.type === 'ready') { /* ... */ }
});

// Or use subscribe for full state
store.subscribe(state => {
    if (state.status === 'ready') {
        console.log(state.data);
    }
});
```

## Verification

1. All existing tests pass (after updating for new API)
2. No TypeScript errors
3. Sync and storage status update independently
4. Events fire correctly for all lifecycle transitions
5. Stores always return current state (not stale)
6. beforeunload handler still works (checks both statuses)
7. Event handlers receive correct discriminated union types

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Status types | 1 combined `StoreStatus` | 2 separate: `SyncStatus`, `StorageStatus` |
| Status stores | 1 `statusStore` | 2: `syncStatusStore`, `storageStatusStore` |
| Event types | `$store:state` emits full state | All events are `{type: ...}` signals |
| Event count | 3 (`state`, `status`, `sync`) | 3 (`state`, `sync`, `storage`) |
| Store pattern | Events carry state | Stores fetch state on notification |
