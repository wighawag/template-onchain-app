# Fix: Remove notifyStateChange() from Sync Operations

## Issue

The current implementation calls `notifyStateChange()` after sync operations ([`performSyncPush`](../web/src/lib/core/sync/createSyncableStore.ts:343) and [`performSyncPull`](../web/src/lib/core/sync/createSyncableStore.ts:389)), which violates the design goal from Phase 6.2.1 of the [missing features plan](./syncable-store-missing-features.md).

### Design Goal (Phase 6.2.1)

> Main store `subscribe()` now ONLY triggers on state transitions, NOT on data mutations.

The main `subscribe()` should only notify subscribers when the **state transitions** (idle → loading → ready), not when data changes within the ready state.

### Current Behavior (Incorrect)

```typescript
// In performSyncPull - line ~389
if (changes.length > 0) {
  // ... emit field events ...
  notifyStateChange(); // ❌ This triggers main subscribe() on data changes
}
```

### Expected Behavior

Field-level events (`field:added`, `field:updated`, `field:removed`, `field:changed`) are already emitted for data changes. Components should use:
- `getFieldStore(field)` - for field-level reactivity
- `getItemStore(field, key)` - for item-level reactivity
- `on('fieldName:changed', callback)` - for event-based subscriptions

The main `subscribe()` should NOT re-trigger on sync-induced data changes.

---

## Files to Modify

### [`web/src/lib/core/sync/createSyncableStore.ts`](../web/src/lib/core/sync/createSyncableStore.ts)

#### 1. Remove from `performSyncPush()` (around line 343-344)

```diff
  // After successful push
- if (changes.length > 0) {
-   notifyStateChange();
- }
```

#### 2. Remove from `performSyncPull()` (around line 389-391)

```diff
  if (changes.length > 0) {
    // ... emit field events ...
-   notifyStateChange();
  }
```

#### 3. Remove from cross-tab storage watch callback (around line 546-548)

```diff
  // In setAccount, storage.watch callback
  if (changes.length > 0) {
-   notifyStateChange();
  }
```

---

## Impact Assessment

### Breaking Changes

**None for most users.** This is a correction to match documented behavior.

### Migration

Users who were relying on the main `subscribe()` to detect data changes from sync should migrate to:

```typescript
// Before (incorrect usage)
store.subscribe(state => {
  if (state.status === 'ready') {
    // React to all changes including sync
  }
});

// After (correct usage)
store.on('operations:added', ({ key, item }) => { ... });
store.on('operations:updated', ({ key, item }) => { ... });
// Or use getFieldStore/getItemStore
```

---

## Testing

1. Verify `subscribe()` does NOT trigger when:
   - `performSyncPull()` merges server data
   - `performSyncPush()` receives and merges response (in current impl)
   - Cross-tab storage changes are merged

2. Verify `subscribe()` still triggers on:
   - State transitions: idle → loading → ready
   - Account changes

3. Verify field-level events still emit correctly during sync
