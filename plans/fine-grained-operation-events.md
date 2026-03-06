# Fine-Grained Operation Events Plan

## Overview

Refactor the event system in `AccountData.ts` and `createAccountStore.ts` to emit more specific events for operations, enabling better integration with transaction observers.

## Current State

### Current Events
```typescript
type Events = {
  /** Fires when operations are added or removed - structural changes */
  operations: LocalState['operations'];
  /** Fires when an existing operation is modified - content changes only */
  operation: {id: number; operation: OnchainOperation};
};
```

**Problems:**
1. `operations` event is too generic - consumers cannot tell if operations were added, removed, cleared, or set
2. No way to know when account is being switched and data is loading
3. The commented code in `context/index.ts` shows the need for specific events to integrate with `txObserver`

## Proposed Changes

### New Events Type

```typescript
type Events = {
  /** Fires when an operation is removed */
  'operations:removed': {id: number; operation: OnchainOperation};
  /** Fires when an operation is added */
  'operations:added': {id: number; operation: OnchainOperation};
  /** Fires when all operations are cleared - account switch */
  'operations:cleared': undefined;
  /** Fires when operations are set - initial load after account switch */
  'operations:set': LocalState['operations'];
  /** Fires when an existing operation is modified - content changes only */
  operation: {id: number; operation: OnchainOperation};
  /** Fires when loading state changes */
  loading: boolean;
};
```

### Loading State Mechanism

Add a `loading` property to track when account data is being fetched:

```typescript
// In createAccountStore.ts
let loading = false;

async function setAccount(newAccount?: `0x${string}`): Promise<void> {
  if (newAccount === state.account) return;

  // Wait for pending saves and emit cleared event
  if (state.account) {
    const pending = pendingSaves.get(state.account);
    if (pending) await pending;
    
    // Emit cleared events (e.g., 'operations:cleared')
    _emitClearEvents();
  }

  // IMMEDIATELY clear state to default for new account
  // This ensures no references to old account data during loading
  state = defaultState(newAccount);

  // If no account, emit events and return (no loading needed)
  if (!newAccount) {
    emitter.emit('state', state);
    _emitLoadEvents(state);
    return;
  }

  // Set loading state
  loading = true;
  emitter.emit('loading', true);
  
  loadGeneration++;
  const gen = loadGeneration;

  // Load stored state for the new account
  const loadedState = await _load(newAccount);
  
  // Only apply if still current load generation
  if (gen === loadGeneration) {
    state = loadedState;
  }

  // Clear loading state
  loading = false;
  emitter.emit('loading', false);

  // Emit state and load events
  emitter.emit('state', state);
  _emitLoadEvents(state);
}
```

**Key behavior:**
- State is immediately cleared to `defaultState(newAccount)` after emitting `operations:cleared`
- During loading, `state.operations` is empty (default state)
- `loading` is `true` during the async fetch
- Once loading completes, state is updated with loaded data and `operations:set` is emitted

### Mutation Changes

#### addOperation
```typescript
addOperation(state, transactionIntent, description, type) {
  let id = Date.now();
  while (state.operations[id]) id++;
  const operation = {type, description, transactionIntent};
  state.operations[id] = operation;
  return {
    result: id, 
    event: 'operations:added',
    eventData: {id, operation}
  };
},
```

#### setOperation
```typescript
setOperation(state, id: number, operation: OnchainOperation) {
  const isNew = !state.operations[id];
  state.operations[id] = operation;
  if (isNew) {
    return {
      result: undefined,
      event: 'operations:added',
      eventData: {id, operation},
    };
  }
  return {
    result: undefined,
    event: 'operation',
    eventData: {id, operation},
  };
},
```

#### removeOperation
```typescript
removeOperation(state, id: number) {
  const operation = state.operations[id];
  if (!operation) return {result: false};
  delete state.operations[id];
  return {
    result: true, 
    event: 'operations:removed',
    eventData: {id, operation}
  };
},
```

### onLoad Handler Change

```typescript
// In AccountData.ts createAccountData
onLoad: (state) => [{event: 'operations:set', data: state.operations}],
```

### Public API for Loading State

Add a getter for loading state:
```typescript
return {
  get state() { return state as Readonly<S>; },
  get loading() { return loading; },
  ...wrappedMutations,
  on: emitter.on,
  off: emitter.off,
  start,
  stop,
};
```

## Usage Example

After changes, the context code can be updated to:

```typescript
// Handle initial load / account switch load
accountData.on('operations:set', (operations) => {
  // Set all operations to the observer
  txObserver.addMultiple(
    Object.entries(operations).map(([id, op]) => ({
      id,
      intent: op.transactionIntent
    }))
  );
});

// Handle operation added
accountData.on('operations:added', ({id, operation}) => {
  txObserver.add(id.toString(), operation.transactionIntent);
});

// Handle operation removed
accountData.on('operations:removed', ({id}) => {
  txObserver.remove(id.toString());
});

// Handle account switch - clear observer
accountData.on('operations:cleared', () => {
  txObserver.clear();
});

// Handle loading state
accountData.on('loading', (isLoading) => {
  if (isLoading) {
    // Show loading indicator, disable UI, etc.
  }
});
```

## Files to Modify

1. **`web/src/lib/account/AccountData.ts`**
   - Update `Events` type definition
   - Update mutation return values to use new event names
   - Update `onLoad` configuration

2. **`web/src/lib/core/account/createAccountStore.ts`**
   - Add `loading` state variable
   - Add `loading` event emission in `setAccount`
   - Add `operations:cleared` event emission before account switch
   - Add `loading` getter to returned object

## Migration Notes

- The old `operations` event is removed entirely
- The `operation` event for content-only changes remains unchanged
- Consumers need to update their event subscriptions to use the new granular events
