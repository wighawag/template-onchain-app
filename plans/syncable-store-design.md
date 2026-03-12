# Syncable Store Design - Automatic Merge & Cleanup

## Overview

This design introduces a **type-constrained sync system** where merge and cleanup are **fully automatic** - no user-provided functions required. Users simply define their data types to satisfy the `Syncable` constraint, and the library handles everything else.

### Key Benefits

1. **Zero user code for merge/cleanup** - Automatic, stable, convergent
2. **Type-safe** - TypeScript enforces the `Syncable` constraint
3. **Deeply nested structures** - Recursive merge at any depth
4. **Separate tombstone storage** - Clean data types for external consumers
5. **Per-item expiration** - `deleteAt` field controls cleanup per item
6. **Cross-tab + server sync** - Same mechanism for all sync sources

---

## Quick Start

### The Types

```typescript
// Optional timestamp fields for syncable items
interface SyncableFields {
    updatedAt?: number;   // For conflict resolution (ms, missing = 0 or inherit)
    deleteAt?: number;    // For cleanup (ms, missing = permanent)
}

// Your data types use Syncable
type Syncable<T = {}> = T & SyncableFields;

// For items that MUST be deletable (prevents zombie resurrection)
type Deletable<T> = T & SyncableFields & { deleteAt: number };

// For items that should NEVER be deleted
type Permanent<T> = T & { updatedAt?: number };

// Storage wraps data with separate tombstones
interface StorageShape<D> {
    data: D;
    $tombstones: TombstonesOf<D>;
}
```

### Usage Example

```typescript
// Define deletable items (require deleteAt)
type OnchainOperation = Deletable<{
    tx: string;
    status: 'pending' | 'confirmed';
}>;

// Define permanent items (no deleteAt)
type UserSettings = Permanent<{
    volume: number;
    muted: boolean;
}>;

type AccountData = {
    operations: Record<number, OnchainOperation>;
    settings: UserSettings;
};

// Create store - merge/cleanup are AUTOMATIC!
const store = createSyncableStore<AccountData>({
    storage,
    storageKey: (addr) => `account-${addr}`,
    account,
});
```

---

## Type System

### Core Types

```typescript
/**
 * Fields that make an item syncable.
 * Both fields are optional.
 */
interface SyncableFields {
    /**
     * When the item was last updated.
     * Used for conflict resolution during merge.
     * Missing = 0 (or inherit from parent)
     */
    updatedAt?: number;
    
    /**
     * When the item should be cleaned up.
     * Missing = permanent (never auto-delete)
     */
    deleteAt?: number;
}

/**
 * A Syncable item is your data plus optional timestamp fields.
 */
type Syncable<T = {}> = T & SyncableFields;

/**
 * For items that MUST support deletion.
 * IMPORTANT: If an item can be deleted, it MUST have deleteAt set initially.
 * Otherwise, zombie resurrection can occur when a client comes back online
 * after tombstones have been cleaned up.
 */
type Deletable<T> = T & SyncableFields & { deleteAt: number };

/**
 * For items that should NEVER be deleted.
 * No deleteAt field - TypeScript enforces this at compile time.
 */
type Permanent<T> = T & { updatedAt?: number };

/**
 * Storage shape with separate tombstones.
 * External consumers only see `data`, tombstones are internal.
 */
interface StorageShape<D> {
    data: D;
    $tombstones: TombstonesOf<D>;
}

/**
 * Tombstone shape mirrors the data shape.
 * Each leaf becomes a number (the deleteAt timestamp).
 */
type TombstonesOf<D> = D extends Record<string | number, any>
    ? { [K in keyof D]?: D[K] extends Record<infer Key, any>
        ? Record<Key, number>
        : number | undefined }
    : number | undefined;
```

### Type Guards

```typescript
function hasUpdatedAt(value: unknown): value is { updatedAt: number } {
    return value !== null 
        && typeof value === 'object' 
        && 'updatedAt' in value 
        && typeof (value as any).updatedAt === 'number';
}

function hasDeleteAt(value: unknown): value is { deleteAt: number } {
    return value !== null 
        && typeof value === 'object' 
        && 'deleteAt' in value 
        && typeof (value as any).deleteAt === 'number';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null 
        && typeof value === 'object' 
        && !Array.isArray(value);
}
```

---

## Why `deleteAt` Must Be Set Initially

**Problem: Zombie Resurrection**

```
Timeline:
1. Tab A has item X (no deleteAt)
2. Tab B deletes item X → tombstone with deleteAt = now + 7 days
3. 8 days pass, tombstone expires and is cleaned up
4. Tab A comes back online with item X
5. Item X reappears! (zombie)
```

**Solution: Type-level enforcement**

```typescript
// For deletable items, require deleteAt at compile time
type OnchainOperation = Deletable<{
    tx: string;
    status: string;
}>;

// Creating an operation without deleteAt is a TYPE ERROR
const op: OnchainOperation = {
    tx: '0x...',
    status: 'pending',
    updatedAt: Date.now(),
    // ERROR: Property 'deleteAt' is missing
};

// Correct:
const op: OnchainOperation = {
    tx: '0x...',
    status: 'pending',
    updatedAt: Date.now(),
    deleteAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
};
```

---

## Storage Structure

### Example

```typescript
type AccountData = {
    operations: Record<number, Deletable<OnchainOperation>>;
    settings: Permanent<UserSettings>;
    perChain: {
        mainnet: Record<string, Deletable<OnchainOperation>>;
        polygon: Record<string, Deletable<OnchainOperation>>;
    };
};

// Stored as:
const storage: StorageShape<AccountData> = {
    data: {
        operations: {
            1710000000000: { 
                tx: '0xabc...', 
                status: 'confirmed',
                updatedAt: 1710000000000,
                deleteAt: 1735689600000,  // Required for Deletable
            },
        },
        settings: {
            volume: 0.8,
            muted: false,
            updatedAt: 1710000000000,
            // No deleteAt - permanent
        },
        perChain: {
            mainnet: {},
            polygon: {},
        },
    },
    $tombstones: {
        operations: {
            1709000000000: 1715000000000,  // Deleted, expires at this time
        },
        perChain: {
            mainnet: {},
            polygon: {},
        },
    },
};

// External consumers see clean types:
function getOperations(): Record<number, OnchainOperation> {
    return storage.data.operations;  // No tombstones mixed in!
}
```

---

## Merge Algorithm

### Rules

| Scenario | Result |
|----------|--------|
| **Tombstone vs Live** | Tombstone **always wins** |
| **Tombstone vs Tombstone** | Keep one with later `deleteAt` |
| **Live vs Live** | Higher `updatedAt` wins |
| **Equal `updatedAt`** | Deterministic tiebreaker (JSON comparison) |
| **Missing `updatedAt`** | Inherit from parent, else treat as 0 |
| **Both missing `updatedAt`** | Recurse into children, then tiebreaker |

### Deterministic Tiebreaker

**No clientId needed!** When timestamps are equal, use deterministic comparison:

```typescript
/**
 * Deterministic tiebreaker when timestamps are equal.
 * Lexicographically smaller JSON wins.
 * This is stable: same inputs always produce same output.
 */
function tiebreaker<T>(current: T, incoming: T): T {
    const currentStr = JSON.stringify(current);
    const incomingStr = JSON.stringify(incoming);
    return currentStr <= incomingStr ? current : incoming;
}
```

**Why this works:**
- Deterministic: Same inputs → same output on all clients
- No extra state: No clientId to store or sync
- Convergent: All clients will pick the same winner

### Recursive Merge Implementation

```typescript
/**
 * Deep merge of Syncable data structures.
 * - Inner timestamps take precedence over inherited
 * - Parent changes affect children without own timestamps
 * - Tombstones always win
 */
function deepMerge<D>(
    current: StorageShape<D>,
    incoming: StorageShape<D>
): StorageShape<D> {
    const mergedTombstones = deepMergeTombstones(
        current.$tombstones, 
        incoming.$tombstones
    );
    
    const mergedData = deepMergeData(
        current.data,
        incoming.data,
        current.$tombstones,
        incoming.$tombstones,
        0  // parentUpdatedAt
    );
    
    return {
        data: mergedData,
        $tombstones: mergedTombstones,
    };
}

function deepMergeData<D>(
    currentData: D,
    incomingData: D,
    currentTombstones: TombstonesOf<D>,
    incomingTombstones: TombstonesOf<D>,
    parentUpdatedAt: number
): D {
    // Handle null/undefined
    if (currentData === null || currentData === undefined) return incomingData;
    if (incomingData === null || incomingData === undefined) return currentData;
    
    // Get effective timestamps for this level
    const currentTs = getEffectiveTimestamp(currentData, parentUpdatedAt);
    const incomingTs = getEffectiveTimestamp(incomingData, parentUpdatedAt);
    
    // If not objects, compare as leaf values
    if (!isPlainObject(currentData) || !isPlainObject(incomingData)) {
        return pickWinner(currentData, incomingData, currentTs, incomingTs);
    }
    
    // Both are objects - merge recursively
    const result: Record<string, unknown> = {};
    const allKeys = new Set([
        ...Object.keys(currentData),
        ...Object.keys(incomingData)
    ]);
    
    // Use max of effective timestamps as parent for children
    const effectiveParentTs = Math.max(currentTs, incomingTs);
    
    for (const key of allKeys) {
        if (key === 'updatedAt' || key === 'deleteAt') {
            // Timestamp fields: take the max
            const cv = (currentData as any)[key] ?? 0;
            const iv = (incomingData as any)[key] ?? 0;
            if (cv > 0 || iv > 0) {
                result[key] = Math.max(cv, iv);
            }
        } else {
            // Regular field: recurse
            result[key] = deepMergeData(
                (currentData as any)[key],
                (incomingData as any)[key],
                (currentTombstones as any)?.[key],
                (incomingTombstones as any)?.[key],
                effectiveParentTs
            );
        }
    }
    
    return result as D;
}

function getEffectiveTimestamp(item: unknown, parentTs: number): number {
    if (hasUpdatedAt(item)) {
        return item.updatedAt;
    }
    return parentTs;
}

function pickWinner<T>(current: T, incoming: T, currentTs: number, incomingTs: number): T {
    if (incomingTs > currentTs) {
        return incoming;
    } else if (currentTs > incomingTs) {
        return current;
    } else {
        // Tie - deterministic comparison
        return tiebreaker(current, incoming);
    }
}

function deepMergeTombstones<T>(
    current: TombstonesOf<T>,
    incoming: TombstonesOf<T>
): TombstonesOf<T> {
    if (!current && !incoming) return {} as TombstonesOf<T>;
    if (!current) return incoming;
    if (!incoming) return current;
    
    const result: Record<string, unknown> = { ...current };
    
    for (const [key, incomingValue] of Object.entries(incoming)) {
        const currentValue = (current as any)[key];
        
        if (typeof incomingValue === 'number') {
            // Tombstone entry - keep later deleteAt
            result[key] = Math.max(currentValue ?? 0, incomingValue);
        } else if (isPlainObject(incomingValue)) {
            // Nested tombstones - recurse
            result[key] = deepMergeTombstones(
                currentValue,
                incomingValue
            );
        }
    }
    
    return result as TombstonesOf<T>;
}
```

### Record Merge with Tombstone Checking

```typescript
function mergeRecords<K extends string | number, T>(
    currentData: Record<K, T>,
    incomingData: Record<K, T>,
    currentTombstones: Record<K, number> | undefined,
    incomingTombstones: Record<K, number> | undefined,
    parentUpdatedAt: number
): { data: Record<K, T>; tombstones: Record<K, number> } {
    const data: Record<K, T> = { ...currentData };
    const tombstones: Record<K, number> = { ...(currentTombstones || {}) };
    
    // Merge incoming tombstones first (tombstones always win)
    for (const [key, deleteAt] of Object.entries(incomingTombstones || {})) {
        const k = key as K;
        const existing = tombstones[k];
        if (!existing || deleteAt > existing) {
            tombstones[k] = deleteAt;
            delete data[k];  // Tombstone wins, remove from data
        }
    }
    
    // Merge incoming data (skip tombstoned items)
    for (const [key, item] of Object.entries(incomingData) as [K, T][]) {
        if (tombstones[key] !== undefined) {
            continue;  // Tombstoned, skip
        }
        
        const existing = data[key];
        if (!existing) {
            data[key] = item;
        } else {
            // Both have this item - merge recursively
            data[key] = deepMergeData(
                existing,
                item,
                undefined,
                undefined,
                parentUpdatedAt
            ) as T;
        }
    }
    
    return { data, tombstones };
}
```

---

## Cleanup Algorithm

### Rules

| Item Type | Cleanup Condition |
|-----------|-------------------|
| Live with `deleteAt` | Remove if `Date.now() >= deleteAt` |
| Live without `deleteAt` | **Never delete** (permanent) |
| Tombstone | Remove if `Date.now() >= deleteAt` |

### Implementation

```typescript
function deepCleanup<D>(storage: StorageShape<D>): StorageShape<D> {
    const now = Date.now();
    
    return {
        data: cleanupData(storage.data, now),
        $tombstones: cleanupTombstones(storage.$tombstones, now),
    };
}

function cleanupData<D>(data: D, now: number): D {
    if (!isPlainObject(data)) return data;
    
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(data)) {
        if (isPlainObject(value)) {
            // Check if this item should be removed
            if (hasDeleteAt(value) && value.deleteAt <= now) {
                continue;  // Expired, skip
            }
            // Recurse
            result[key] = cleanupData(value, now);
        } else {
            result[key] = value;
        }
    }
    
    return result as D;
}

function cleanupTombstones<T>(tombstones: TombstonesOf<T>, now: number): TombstonesOf<T> {
    if (!tombstones || !isPlainObject(tombstones)) return {} as TombstonesOf<T>;
    
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(tombstones)) {
        if (typeof value === 'number') {
            // Tombstone entry - keep if not expired
            if (value > now) {
                result[key] = value;
            }
        } else if (isPlainObject(value)) {
            // Nested tombstones - recurse
            const cleaned = cleanupTombstones(value, now);
            if (Object.keys(cleaned).length > 0) {
                result[key] = cleaned;
            }
        }
    }
    
    return result as TombstonesOf<T>;
}
```

---

## Multi-Level Syncable

`updatedAt` can be at any level, with inheritance from parent:

```typescript
// Example: Multi-level timestamps
const data = {
    audio: {
        updatedAt: 1000,              // Parent timestamp
        sound: { 
            volume: 0.5, 
            updatedAt: 2000           // Own timestamp (takes precedence)
        },
        music: { 
            volume: 0.8               // No timestamp, inherits 1000
        }
    }
};
```

### Merge Behavior

```
Tab A: audio.sound.updatedAt = 2000, volume = 0.5
Tab B: audio.sound.updatedAt = 3000, volume = 0.7
Result: volume = 0.7 (Tab B wins, higher timestamp)

Tab A: audio.music (inherits 1000), volume = 0.8
Tab B: audio.music (inherits 3000), volume = 0.9
Result: volume = 0.9 (Tab B wins, inherited timestamp is higher)

Tab A: audio.music.volume = 0.8, no updatedAt
Tab B: audio.music.volume = 0.9, no updatedAt
Both inherit same parent timestamp → tie → deterministic tiebreaker
```

---

## Helper Functions

### Creating Items

```typescript
/**
 * Create a new Deletable item.
 * deleteAt is REQUIRED to prevent zombie resurrection.
 */
function createDeletable<T>(
    data: T,
    deleteAt: number
): Deletable<T> {
    return {
        ...data,
        updatedAt: Date.now(),
        deleteAt,
    };
}

/**
 * Create a new Permanent item.
 */
function createPermanent<T>(data: T): Permanent<T> {
    return {
        ...data,
        updatedAt: Date.now(),
    };
}

/**
 * Update an existing Syncable item.
 */
function updateSyncable<T extends SyncableFields>(
    item: T,
    updates: Partial<Omit<T, 'updatedAt' | 'deleteAt'>>
): T {
    return {
        ...item,
        ...updates,
        updatedAt: Date.now(),
    };
}
```

### Deleting Items

```typescript
/**
 * Delete an item from storage.
 * Creates a tombstone with the item's deleteAt value.
 */
function deleteItem<D>(
    storage: StorageShape<D>,
    path: (string | number)[],
): void {
    const item = getAtPath(storage.data, path);
    
    if (!item) return;
    
    // Get deleteAt from item (should always exist for Deletable items)
    const deleteAt = hasDeleteAt(item) ? item.deleteAt : Date.now() + 365 * 24 * 60 * 60 * 1000;
    
    // Remove from data
    deleteAtPath(storage.data, path);
    
    // Add tombstone
    setTombstoneAtPath(storage.$tombstones, path, deleteAt);
}
```

---

## Store Configuration

```typescript
interface SyncableStoreConfig<D> {
    /** Storage adapter (localStorage, IndexedDB, etc.) */
    storage: AsyncStorage<StorageShape<D>>;
    
    /** Function to generate storage key from account */
    storageKey: (account: `0x${string}`) => string;
    
    /** Account store to subscribe to */
    account: AccountStore;
    
    /** 
     * Optional: Custom merge function.
     * If not provided, automatic deep merge is used.
     */
    merge?: (current: StorageShape<D>, incoming: StorageShape<D>) => StorageShape<D>;
    
    /**
     * Optional: Custom cleanup function.
     * If not provided, automatic deep cleanup is used.
     */
    cleanup?: (data: StorageShape<D>) => StorageShape<D>;
}
```

**Note:** No `clientId` required! The deterministic tiebreaker doesn't need it.

---

## Implementation Files

### Files to Create

1. **`web/src/lib/core/sync/types.ts`**
   - `SyncableFields`, `Syncable`, `Deletable`, `Permanent`
   - `StorageShape`, `TombstonesOf`
   - Type guards: `hasUpdatedAt`, `hasDeleteAt`, `isPlainObject`

2. **`web/src/lib/core/sync/helpers.ts`**
   - `createDeletable`, `createPermanent`, `updateSyncable`
   - `deleteItem`, `getAtPath`, `setAtPath`, `deleteAtPath`, `setTombstoneAtPath`

3. **`web/src/lib/core/sync/merge.ts`**
   - `deepMerge`, `deepMergeData`, `deepMergeTombstones`
   - `mergeRecords`, `getEffectiveTimestamp`, `pickWinner`, `tiebreaker`

4. **`web/src/lib/core/sync/cleanup.ts`**
   - `deepCleanup`, `cleanupData`, `cleanupTombstones`

5. **`web/src/lib/core/sync/createSyncableStore.ts`**
   - Main store factory
   - Watch callback with automatic merge/cleanup

### Files to Modify

1. **`web/src/lib/account/AccountData.ts`**
   - Update types to use `Deletable<T>` for operations
   - Use `createSyncableStore` instead of `createAccountStore`

---

## Testing Plan

### Unit Tests: Merge Algorithm

| Test Case | Description |
|-----------|-------------|
| `merge-live-current-wins` | Current has higher updatedAt |
| `merge-live-incoming-wins` | Incoming has higher updatedAt |
| `merge-live-tie` | Same updatedAt, deterministic tiebreaker |
| `merge-tombstone-wins` | Tombstone beats live item |
| `merge-tombstone-vs-tombstone` | Later deleteAt wins |
| `merge-missing-timestamp` | Inherits from parent |
| `merge-nested-timestamps` | Inner timestamps take precedence |
| `merge-deep-nesting` | Multiple levels of nesting |
| `merge-record-with-tombstones` | Record merge respects tombstones |

### Unit Tests: Cleanup Algorithm

| Test Case | Description |
|-----------|-------------|
| `cleanup-expired-item` | Item with past deleteAt is removed |
| `cleanup-valid-item` | Item with future deleteAt is kept |
| `cleanup-permanent-item` | Item without deleteAt is kept |
| `cleanup-expired-tombstone` | Tombstone with past deleteAt is removed |
| `cleanup-valid-tombstone` | Tombstone with future deleteAt is kept |
| `cleanup-nested-structure` | Cleanup recurses into nested objects |

### Unit Tests: Edge Cases

| Test Case | Description |
|-----------|-------------|
| `same-key-same-timestamp` | Deterministic tiebreaker is consistent |
| `deep-nesting-mixed-timestamps` | Some levels have timestamps, some inherit |
| `concurrent-deletes` | Both sides delete different items |
| `concurrent-delete-edit` | One deletes, one edits same item |
| `zombie-prevention` | Deletable type prevents zombie resurrection |

### Integration Tests: Cross-Tab Sync

| Test Case | Description |
|-----------|-------------|
| `sync-edit-propagates` | Tab A edits, Tab B receives |
| `sync-different-keys` | Both tabs edit different keys |
| `sync-same-key` | Both tabs edit same key |
| `sync-delete-edit` | Tab A deletes, Tab B edits |
| `sync-rapid-changes` | Multiple rapid changes converge |

### Integration Tests: Offline/Online

| Test Case | Description |
|-----------|-------------|
| `offline-edit-resync` | Client edits while offline, resyncs |
| `offline-long-period` | Client offline longer than tombstone TTL |
| `offline-multiple-clients` | Multiple clients sync after offline |

---

## Summary

### Key Design Decisions

1. **Separate Tombstone Storage** - `$tombstones` mirrors data structure, keeping data types clean

2. **Deletable vs Permanent Types** - TypeScript enforces `deleteAt` for deletable items at compile time

3. **Deterministic Tiebreaker** - JSON comparison when timestamps equal, no clientId needed

4. **Recursive Merge** - Inner timestamps take precedence, parent affects children without timestamps

5. **Automatic Everything** - No user-provided merge/cleanup functions needed

### Type Summary

```typescript
// For items that can be deleted (require deleteAt)
type Deletable<T> = T & { updatedAt?: number; deleteAt: number };

// For permanent items (no deleteAt)
type Permanent<T> = T & { updatedAt?: number };

// Storage wrapper
interface StorageShape<D> {
    data: D;
    $tombstones: TombstonesOf<D>;
}
```
