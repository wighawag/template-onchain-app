# Generic Store Plan

A generic observable store built on `radiate` that provides type-safe field updates with hierarchical event matching.

## When to Use This

**Consider this generic store when:**
- You have 3+ state modules with similar patterns (field updates, Record CRUD, Array CRUD)
- You need hierarchical event matching (`:*`, `:**`) across multiple stores
- Type-safe event subscriptions are critical for maintainability

**Consider simpler alternatives when:**
- You have 1-2 state modules (use direct `radiate` with manual events)
- Your state is flat with no nested structures
- You don't need wildcard event patterns

## Core Concepts

### Event Naming Convention

Given a state like:
```typescript
type State = {
  account: string;
  user: { name: string; settings: { theme: string } };
  operations: Record<string, { type: string; data: any }>;
  items: Array<{ id: string; text: string }>;
}
```

**Event patterns:**

| Pattern | Fires When | Example |
|---------|------------|---------|
| `account` | Field is set | `set('account', 'new')` |
| `user` | Entire object is replaced | `set('user', {...})` |
| `user.name` | Specific nested field changes | `set('user.name', 'John')` |
| `user:*` | Any direct child of user changes | `set('user.name', ...)` or `set('user.settings', ...)` |
| `user:**` | Any nested descendant changes | `set('user.settings.theme', ...)` |
| `operations.abc` | Specific Record entry changes | `set('operations.abc', {...})` |
| `operations:*` | Any Record entry changes | Any operation add/update/remove |
| `items` | Array structure changes | `push`, `remove`, `clear` |
| `items#abc` | Specific array item by ID | `update('items', 'abc', {...})` |
| `items:*` | Any array item changes | Any item add/update/remove |

**Note:** No `items[index]` events - array indices are unstable and not useful for subscriptions.

## API Design

```typescript
import { createStore } from './store';

const store = createStore<State>({
  account: '',
  user: { name: '', settings: { theme: 'dark' } },
  operations: {},
  items: []
}, {
  getItemId: {
    items: (item) => item.id
  }
});
```

### Reading State

```typescript
// Direct access to state object
store.$state.account;              // string
store.$state.user.name;            // string
store.$state.user.settings.theme;  // string
store.$state.operations['abc'];    // { type, data } | undefined
store.$state.items[0];             // { id, text } | undefined
```

### Writing State

All mutations go through `update()` which batches changes and emits events once:

```typescript
store.update(({ set, push, remove, update, clear }) => {
  // Field updates
  set('account', 'new');                          // emits: account
  set('user.name', 'John');                       // emits: user.name, user:*, user:**
  set('user.settings.theme', 'light');            // emits: user.settings.theme, user.settings:*, user.settings:**, user:*, user:**
  
  // Record operations (via set with dot notation)
  set('operations.abc', { type: 'x', data: 1 });  // emits: operations.abc, operations:*
  
  // Array operations
  push('items', { id: 'new', text: 'hello' });    // emits: items, items#new, items:*
  remove('items', 'abc');                          // emits: items, items#abc, items:*
  update('items', 'abc', { text: 'updated' });    // emits: items#abc, items:*
  clear('items');                                  // emits: items (+ items#id for each if listeners exist)
});
```

### Subscribing to Events

```typescript
// Exact field
store.on('account', (value) => { });

// Nested field
store.on('user.name', (value) => { });

// Wildcard - direct children
store.on('user:*', (field, value) => { });        // field = 'name' | 'settings'

// Wildcard - all descendants
store.on('user:**', (path, value) => { });        // path = 'name' | 'settings' | 'settings.theme'

// Record entries
store.on('operations.abc', (value) => { });       // specific entry
store.on('operations:*', (key, value) => { });    // any entry

// Array
store.on('items', (array) => { });                // structure changes
store.on('items#abc', (item) => { });             // specific item by ID
store.on('items:*', (id, item) => { });           // any item change
```

## Implementation Phases

### Phase 1: Core Store
- Create store with initial state exposed via `$state`
- Basic `update()` with `set(field, value)` for top-level fields only
- Emit exact field events after update completes
- Use `radiate` for event emission

### Phase 2: Nested Path Support
- Parse dot-notation paths in `set()`: `set('user.name', 'John')`
- Mutate nested paths in place
- Emit hierarchical events: `user.name` → `user:*` → `user:**`
- Event emission order: most specific → least specific

### Phase 3: Record Support
- Treat Record fields like nested objects
- `set('operations.abc', value)` adds/updates entry
- `set('operations.abc', undefined)` removes entry
- Emit `operations.abc` and `operations:*` events

### Phase 4: Array Support
- `push(field, item)` - add item, emit `items`, `items#id`, `items:*`
- `remove(field, id)` - remove by ID, emit `items`, `items#id`, `items:*`
- `update(field, id, partial)` - update by ID, emit `items#id`, `items:*` (not `items`)
- `clear(field)` - remove all, emit `items` (+ `items#id` for each if listeners exist)
- Requires `getItemId` config for ID-based operations

### Phase 5: Type Safety
- TypeScript generics for state type
- Type-safe paths via template literal types
- Type-safe event callbacks
- Autocompletion for paths and event names

## Implementation Notes

### Change Tracking

The `update()` callback receives mutation helpers that record changes:

```typescript
store.update(({ set, push }) => {
  set('user.name', 'John');            // records: { type: 'set', path: 'user.name', value: 'John' }
  push('items', { id: 'x', text: '' }); // records: { type: 'push', field: 'items', item: {...} }
  
  // After callback completes:
  // 1. Apply all recorded changes to state
  // 2. Compute event tree from recorded changes
  // 3. Emit all events in order
});
```

### Event Emission Order

When `user.settings.theme` is set, events fire in this order:
1. `user.settings.theme` (exact match)
2. `user.settings:*` (direct child of settings)
3. `user.settings:**` (recursive from settings) 
4. `user:*` (direct child of user)
5. `user:**` (recursive from user)

Most specific first, then progressively broader wildcards.

### State Mutability

State is mutable - changes are applied directly to `$state`:
```typescript
set('user.name', 'John')
// Mutates: store.$state.user.name = 'John'
```

The `$state` reference stays the same throughout. Mutations should go through `update()` to ensure events are emitted.

### Listener Existence Check

For performance, some operations check if listeners exist:
- `clear('items')` only emits individual `items#id` events if there are listeners for them
- Use `store.hasListeners('items#*')` to check if any ID-specific listeners exist

## Comparison with Alternatives

| Feature | This Store | Observator | Manual radiate |
|---------|------------|------------|----------------|
| Change detection | Explicit `set()` | Proxy-based patches | Manual emit |
| Event patterns | Hierarchical (`:*`, `:**`) | Field + keyed | Manual |
| Type safety | Full inference | Partial | Manual |
| Bundle size | ~2KB | ~3KB | ~1KB |
| Complexity | Medium | High | Low |
| Learning curve | Medium | Medium | Low |

## File Structure

```
web/src/lib/local/
├── store.ts           # Core store implementation
├── store.test.ts      # Unit tests
└── AlternativeLocalState.ts  # Refactored to use store.ts
```
