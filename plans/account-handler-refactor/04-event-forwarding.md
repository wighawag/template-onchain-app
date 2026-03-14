# Phase 4: Event Forwarding

## Overview

Event forwarding is the mechanism by which handler events reach the store's emitter. Only events from the current handler should be forwarded to the main store.

## Event Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Handler A                           Handler B                   │
│  ┌──────────────────┐               ┌──────────────────┐        │
│  │ handler.emitter  │               │ handler.emitter  │        │
│  │ - $store:state   │               │ - $store:state   │        │
│  │ - $store:sync    │               │ - $store:sync    │        │
│  │ - $store:storage │               │ - $store:storage │        │
│  │ - settings:changed│              │ - settings:changed│       │
│  │ - items:added    │               │ - items:added    │        │
│  │ - items:updated  │               │ - items:updated  │        │
│  │ - items:removed  │               │ - items:removed  │        │
│  └────────┬─────────┘               └────────┬─────────┘        │
│           │                                  │                   │
│           ▼                                  ▼                   │
│      ┌─────────────────────────────────────────────┐            │
│      │         Event Forwarding Logic              │            │
│      │                                             │            │
│      │   if (handler.account === currentAccount)   │            │
│      │       → Forward to storeEmitter             │            │
│      │   else                                      │            │
│      │       → Drop (background handler)           │            │
│      └─────────────────────────────────────────────┘            │
│                           │                                      │
│                           ▼                                      │
│              ┌──────────────────────┐                           │
│              │   storeEmitter       │ ← UI subscribes here      │
│              │ (current account     │                           │
│              │  events only)        │                           │
│              └──────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

## Event Types to Forward

### System Events

| Event | Payload | Forwarding Logic |
|-------|---------|------------------|
| `$store:state` | `StateEvent` | Forward if current, update storeAsyncState |
| `$store:sync` | `SyncEvent` | Forward if current |
| `$store:storage` | `StorageEvent` | Forward if current |

### Schema-Derived Events

For each field in schema:

**Permanent fields:**
| Event | Payload | Forwarding Logic |
|-------|---------|------------------|
| `{field}:changed` | Value | Forward if current |

**Map fields:**
| Event | Payload | Forwarding Logic |
|-------|---------|------------------|
| `{field}:added` | `{key, item}` | Forward if current |
| `{field}:updated` | `{key, item}` | Forward if current |
| `{field}:removed` | `{key, item}` | Forward if current |

## Implementation

### wireHandlerEvents Function

```typescript
function wireHandlerEvents(handler: AccountHandler<S>): void {
  // System events
  forwardSystemEvents(handler);
  
  // Schema-derived events
  forwardSchemaEvents(handler);
}

function forwardSystemEvents(handler: AccountHandler<S>): void {
  // State events - special handling
  handler.on('$store:state', (event) => {
    if (handler.account !== currentAccount) return;
    
    // Update storeAsyncState based on handler state
    if (event.type === 'ready' && handler.asyncState.status === 'ready') {
      storeAsyncState = {
        status: 'ready',
        account: handler.account,
        data: handler.asyncState.data,
      };
    } else if (event.type === 'loading') {
      storeAsyncState = {
        status: 'loading',
        account: handler.account,
      };
    }
    // Note: 'idle' is store-level only (no account)
    
    storeEmitter.emit('$store:state', event);
  });

  // Sync events
  handler.on('$store:sync', (event) => {
    if (handler.account !== currentAccount) return;
    storeEmitter.emit('$store:sync', event);
  });

  // Storage events
  handler.on('$store:storage', (event) => {
    if (handler.account !== currentAccount) return;
    storeEmitter.emit('$store:storage', event);
  });
}

function forwardSchemaEvents(handler: AccountHandler<S>): void {
  for (const field of Object.keys(schema)) {
    const fieldDef = schema[field];
    
    if (fieldDef.__type === 'permanent') {
      handler.on(`${field}:changed` as keyof StoreEvents<S>, (data) => {
        if (handler.account !== currentAccount) return;
        storeEmitter.emit(`${field}:changed` as keyof StoreEvents<S>, data);
      });
    } else if (fieldDef.__type === 'map') {
      handler.on(`${field}:added` as keyof StoreEvents<S>, (data) => {
        if (handler.account !== currentAccount) return;
        storeEmitter.emit(`${field}:added` as keyof StoreEvents<S>, data);
      });
      
      handler.on(`${field}:updated` as keyof StoreEvents<S>, (data) => {
        if (handler.account !== currentAccount) return;
        storeEmitter.emit(`${field}:updated` as keyof StoreEvents<S>, data);
      });
      
      handler.on(`${field}:removed` as keyof StoreEvents<S>, (data) => {
        if (handler.account !== currentAccount) return;
        storeEmitter.emit(`${field}:removed` as keyof StoreEvents<S>, data);
      });
    }
  }
}
```

### Optimized: Generic Forwarder

To avoid repetition, we can use a generic forwarder:

```typescript
function wireHandlerEvents(handler: AccountHandler<S>): void {
  const forwardIfCurrent = <E extends keyof StoreEvents<S>>(
    event: E,
    transform?: (data: StoreEvents<S>[E]) => void,
  ) => {
    handler.on(event, (data) => {
      if (handler.account !== currentAccount) return;
      if (transform) transform(data);
      storeEmitter.emit(event, data);
    });
  };

  // System events with state update
  handler.on('$store:state', (event) => {
    if (handler.account !== currentAccount) return;
    updateStoreAsyncState(handler, event);
    storeEmitter.emit('$store:state', event);
  });

  forwardIfCurrent('$store:sync');
  forwardIfCurrent('$store:storage');

  // Schema events
  for (const field of Object.keys(schema)) {
    const fieldDef = schema[field];
    
    if (fieldDef.__type === 'permanent') {
      forwardIfCurrent(`${field}:changed` as keyof StoreEvents<S>);
    } else if (fieldDef.__type === 'map') {
      forwardIfCurrent(`${field}:added` as keyof StoreEvents<S>);
      forwardIfCurrent(`${field}:updated` as keyof StoreEvents<S>);
      forwardIfCurrent(`${field}:removed` as keyof StoreEvents<S>);
    }
  }
}

function updateStoreAsyncState(
  handler: AccountHandler<S>,
  event: StateEvent,
): void {
  if (event.type === 'ready' && handler.asyncState.status === 'ready') {
    storeAsyncState = {
      status: 'ready',
      account: handler.account,
      data: handler.asyncState.data,
    };
  } else if (event.type === 'loading') {
    storeAsyncState = {
      status: 'loading',
      account: handler.account,
    };
  }
}
```

## When to Wire Events

Events are wired when a handler is created:

```typescript
function getOrCreateHandler(account: `0x${string}`): AccountHandler<S> {
  let handler = handlers.get(account);
  if (!handler) {
    handler = createAccountHandler(account, config);
    handlers.set(account, handler);
    
    // Wire events immediately
    wireHandlerEvents(handler);
  }
  return handler;
}
```

## Event Cleanup

When a handler is disposed:

```typescript
function disposeHandler(account: `0x${string}`): void {
  const handler = handlers.get(account);
  if (!handler) return;
  
  handler.stop(); // This cleans up internal watchers
  handlers.delete(account);
  
  // Event listeners are automatically cleaned up because
  // the handler's emitter is garbage collected
}
```

## Special Cases

### Account Switch During Event Processing

If account switches while a handler is emitting events:

```typescript
handler.on('$store:sync', (event) => {
  // Check at emit time, not at subscription time
  if (handler.account !== currentAccount) return;
  storeEmitter.emit('$store:sync', event);
});
```

The check happens at emit time, so events are dropped if account changed.

### Async State Synchronization

When handler's asyncState changes, store's storeAsyncState must update:

```typescript
// Handler emits state:ready
// Forwarding logic updates storeAsyncState
// Then forwards to storeEmitter
// UI gets updated storeAsyncState

handler.on('$store:state', (event) => {
  if (handler.account !== currentAccount) return;
  
  // FIRST: Update store state
  updateStoreAsyncState(handler, event);
  
  // THEN: Emit event (UI will read updated storeAsyncState)
  storeEmitter.emit('$store:state', event);
});
```

### Background Handler Completing

When a background handler completes (e.g., sync finished):

```typescript
// Handler A (background) emits sync:completed
// handler.account (A) !== currentAccount (B)
// Event is NOT forwarded to storeEmitter
// UI does not see this event
// Handler A's syncStatus is updated (local to A)

// Later, if user switches back to A:
// - A's handler is reused
// - A's syncStatus shows completed state
```

## Testing Event Forwarding

```typescript
describe('Event Forwarding', () => {
  it('should forward events from current handler', async () => {
    const events: SyncEvent[] = [];
    store.on('$store:sync', (e) => events.push(e));
    
    accountStore.setAccount('0xA');
    await waitForReady(store);
    
    store.set('settings', {value: 1}); // Triggers sync pending
    
    expect(events).toContainEqual({type: 'pending'});
  });
  
  it('should NOT forward events from background handler', async () => {
    const events: SyncEvent[] = [];
    store.on('$store:sync', (e) => events.push(e));
    
    accountStore.setAccount('0xA');
    await waitForReady(store);
    
    const handlerA = store.getHandler();
    
    // Switch to B
    accountStore.setAccount('0xB');
    await waitForReady(store);
    
    // Clear events from switch
    events.length = 0;
    
    // Trigger event on A's handler
    handlerA.set('settings', {value: 1});
    
    // Should NOT appear in store events
    expect(events.filter(e => e.type === 'pending')).toHaveLength(0);
  });
  
  it('should update storeAsyncState before emitting', async () => {
    let stateAtEmit: AsyncState<any> | null = null;
    
    store.on('$store:state', () => {
      stateAtEmit = store.state;
    });
    
    accountStore.setAccount('0xA');
    await waitForReady(store);
    
    expect(stateAtEmit?.status).toBe('ready');
    expect(stateAtEmit?.data).toBeDefined();
  });
});
```

## Checklist

- [ ] Implement wireHandlerEvents function
- [ ] Forward $store:state with state update
- [ ] Forward $store:sync events
- [ ] Forward $store:storage events
- [ ] Forward schema-derived events dynamically
- [ ] Add account check to all forwarding
- [ ] Wire events in getOrCreateHandler
- [ ] Test forwarding behavior
- [ ] Test background handler events are dropped

## Next Phase

After implementing event forwarding, proceed to [05-tests.md](./05-tests.md) for comprehensive tests.
