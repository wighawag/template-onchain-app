# Fix Operation List Re-rendering on Individual Updates

## Problem

When a single operation is updated via `setOperation`, the entire operations list re-renders. This happens because:

1. Line 181 in `createAccountStore.ts` emits `state` on every mutation
2. The `subscribe` method listens for `state` events
3. Components using `$accountData` get notified and re-render

## Goal

- **List should re-render on:** state transitions, `operations:added`, `operations:removed`, `operations:cleared`, `operations:set`
- **List should NOT re-render on:** `operation:updated`
- **Individual cards should update on:** `operation:updated` (via `getOperationStore`)

## Files to Modify

### 1. `web/src/lib/core/account/createAccountStore.ts`

#### Change A: Remove line 181

**Location:** Lines 178-182

**Current code:**
```typescript
// Emit domain-specific event for fine-grained subscriptions
if (event)
    emitter.emit(
        event as keyof (E & {state: AsyncState<D>}),
        (eventData ?? currentState.data) as any,
    );
// Also emit 'state' for Svelte store subscribers
// Note: We emit the same object reference since data was mutated in-place
emitter.emit('state', asyncState);  // <-- REMOVE THIS LINE
return result;
```

**New code:**
```typescript
// Emit domain-specific event for fine-grained subscriptions
if (event)
    emitter.emit(
        event as keyof (E & {state: AsyncState<D>}),
        (eventData ?? currentState.data) as any,
    );
return result;
```

#### Change B: Remove the `subscribe` method from return object

**Location:** Lines 311-317

**Current code:**
```typescript
/** Svelte-compatible subscribe method */
subscribe(callback: (state: Readonly<AsyncState<D>>) => void): () => void {
    // Call with current state immediately (Svelte store contract requirement)
    callback(asyncState);
    // Subscribe to future updates
    return emitter.on('state', callback);
},
```

**Action:** Remove these lines entirely from the return object.

---

### 2. `web/src/lib/account/AccountData.ts`

#### Change: Replace the `extendedStore` object to add a smart `subscribe` method

**Location:** Lines 187-203

**Current code:**
```typescript
// Create extended store with getOperationStore
// Note: We can't use {...store} because it would snapshot the 'state' getter
// Instead, we explicitly forward the getter to preserve reactivity
const extendedStore = {
    get state() {
        return store.state;
    },
    addOperation: store.addOperation,
    setOperation: store.setOperation,
    removeOperation: store.removeOperation,
    on: store.on,
    off: store.off,
    start: store.start,
    stop: store.stop,
    subscribe: store.subscribe,
    getOperationStore,
};
```

**New code:**
```typescript
// Create extended store with getOperationStore
// Note: We can't use {...store} because it would snapshot the 'state' getter
// Instead, we explicitly forward the getter to preserve reactivity
const extendedStore = {
    get state() {
        return store.state;
    },
    addOperation: store.addOperation,
    setOperation: store.setOperation,
    removeOperation: store.removeOperation,
    on: store.on,
    off: store.off,
    start: store.start,
    stop: store.stop,
    /**
     * Svelte-compatible subscribe method.
     * Subscribes to state transitions and list-level changes only.
     * Does NOT subscribe to 'operation:updated' - use getOperationStore for that.
     */
    subscribe(
        callback: (
            state: Readonly<AsyncState<AccountData>>,
        ) => void,
    ): () => void {
        // Call with current state immediately (Svelte store contract)
        callback(store.state);

        // Subscribe to state transitions (idle/loading/ready)
        const unsubState = store.on('state', callback);

        // Subscribe to list-level changes
        const unsubAdded = store.on('operations:added', () =>
            callback(store.state),
        );
        const unsubRemoved = store.on('operations:removed', () =>
            callback(store.state),
        );
        const unsubCleared = store.on('operations:cleared', () =>
            callback(store.state),
        );
        const unsubSet = store.on('operations:set', () =>
            callback(store.state),
        );

        // NOTE: We intentionally do NOT subscribe to 'operation:updated'
        // Individual operation updates are handled by getOperationStore

        return () => {
            unsubState();
            unsubAdded();
            unsubRemoved();
            unsubCleared();
            unsubSet();
        };
    },
    getOperationStore,
};
```

You'll also need to import `AsyncState`:

**Location:** Line 1-4

**Current imports:**
```typescript
import {
    createAccountStore,
    createMutations,
} from '$lib/core/account/createAccountStore';
```

**New imports:**
```typescript
import {
    createAccountStore,
    createMutations,
    type AsyncState,
} from '$lib/core/account/createAccountStore';
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `createAccountStore.ts` | Remove `emitter.emit('state', asyncState)` at line 181 |
| `createAccountStore.ts` | Remove `subscribe` method from return object (lines 311-317) |
| `AccountData.ts` | Add import for `AsyncState` type |
| `AccountData.ts` | Replace `subscribe: store.subscribe` with a smart subscribe method that listens for list-level events only |

## Event Behavior After Changes

| Event | Triggers `$accountData`? | Triggers `getOperationStore`? |
|-------|-------------------------|------------------------------|
| `state` (idle/loading/ready) | ✅ Yes | ✅ Yes |
| `operations:added` | ✅ Yes | N/A |
| `operations:removed` | ✅ Yes | ✅ Yes |
| `operations:cleared` | ✅ Yes | N/A |
| `operations:set` | ✅ Yes | N/A |
| `operation:updated` | ❌ No | ✅ Yes |

## Testing

1. Connect wallet and create multiple operations
2. Trigger an operation update (e.g., transaction status change)
3. Verify only the affected `OperationCard` re-renders, not the entire list
4. Test account switching - verify all cards update appropriately
5. Test operation removal - verify card disappears without affecting others
