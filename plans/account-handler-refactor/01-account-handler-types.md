# Phase 1: Account Handler Types

## Overview

Define the types and interfaces for the AccountHandler before implementing.

## New Types to Add to `types.ts`

### AccountHandler Interface

```typescript
/**
 * Handler for a single account's data and operations.
 * Each account gets its own isolated handler with independent state.
 */
export interface AccountHandler<S extends Schema> {
  /** The account this handler manages */
  readonly account: `0x${string}`;
  
  /** Current async state (loading/ready) */
  readonly asyncState: AccountAsyncState<DataOf<S>>;
  
  /** Sync status - isolated to this account */
  readonly syncStatus: SyncStatus;
  
  /** Storage status - isolated to this account */
  readonly storageStatus: StorageStatus;
  
  /** True if this handler is for the current active account */
  readonly isCurrent: boolean;
  
  /** 
   * Behavior when mutating while this handler is not current.
   * - 'allow': Silently proceed (data saved, no events to main store)
   * - 'warn': Console warning + proceed
   * - 'throw': Throw error
   * Default: 'allow'
   */
  backgroundMutationBehavior: 'allow' | 'warn' | 'throw';
  
  // ============ Mutation Methods ============
  
  /** Set a permanent field value */
  set<K extends PermanentKeys<S>>(field: K, value: ExtractPermanent<S[K]>): void;
  
  /** Patch a permanent field with partial updates */
  patch<K extends PermanentKeys<S>>(field: K, value: DeepPartial<ExtractPermanent<S[K]>>): void;
  
  /** Add an item to a map field */
  add<K extends MapKeys<S>>(field: K, key: string, value: ExtractMapItem<S[K]>, options: {deleteAt: number}): void;
  
  /** Update an existing map item. Throws if item does not exist. */
  update<K extends MapKeys<S>>(field: K, key: string, value: ExtractMapItem<S[K]>): void;
  
  /** Remove an item from a map field. Throws if item does not exist. */
  remove<K extends MapKeys<S>>(field: K, key: string): void;
  
  // ============ Sync Control ============
  
  /** Force sync to server now */
  syncNow(): Promise<void>;
  
  /** Pause server sync */
  pauseSync(): void;
  
  /** Resume server sync */
  resumeSync(): void;
  
  // ============ Lifecycle ============
  
  /** Load data from storage and initialize */
  load(): Promise<void>;
  
  /** Start watching storage changes, periodic sync, etc. */
  start(): void;
  
  /** Stop all watchers and timers */
  stop(): void;
  
  /** Retry loading after a failure */
  retryLoad(): void;
  
  /** Wait for pending saves to complete */
  flush(timeoutMs?: number): Promise<void>;
  
  /** Check if handler has pending work (saves, syncs) */
  hasPendingWork(): boolean;
  
  // ============ Events ============
  
  /** Subscribe to events from this handler */
  on<E extends keyof StoreEvents<S>>(
    event: E,
    callback: (data: StoreEvents<S>[E]) => void,
  ): () => void;
  
  /** Unsubscribe from events */
  off<E extends keyof StoreEvents<S>>(
    event: E,
    callback: (data: StoreEvents<S>[E]) => void,
  ): void;
  
  // ============ Fine-Grained Stores ============
  
  /** Get a reactive store for a specific map item */
  getItemStore<K extends MapKeys<S>>(
    field: K,
    key: string,
  ): Readable<(ExtractMapItem<S[K]> & {deleteAt: number}) | undefined>;
  
  /** Get a reactive store for a top-level field */
  getFieldStore<K extends keyof S>(field: K): Readable<DataOf<S>[K] | undefined>;
}
```

### AccountAsyncState Type

```typescript
/**
 * Async state for a specific account's handler.
 * Simpler than full AsyncState - no account field needed since handler owns it.
 */
export type AccountAsyncState<T> =
  | {status: 'loading'}
  | {status: 'ready'; data: T}
  | {status: 'error'; error: Error};  // For migration failures
```

### AccountHandlerConfig Type

```typescript
/**
 * Configuration passed to createAccountHandler.
 * Subset of SyncableStoreConfig plus handler-specific options.
 */
export interface AccountHandlerConfig<S extends Schema> {
  /** Schema definition */
  schema: S;
  
  /** Local storage adapter */
  storage: AsyncStorage<InternalStorage<S>>;
  
  /** Storage key for this account */
  storageKey: string;
  
  /** Default data factory */
  defaultData: () => DataOf<S>;
  
  /** Clock function for timestamps */
  clock: () => number;
  
  /** Schema version for migrations */
  schemaVersion: number;
  
  /** Migration functions */
  migrations?: Record<number, (oldData: unknown) => InternalStorage<S>>;
  
  /** Optional: Server sync adapter */
  syncAdapter?: SyncAdapter<S>;
  
  /** Optional: Sync configuration */
  syncConfig?: SyncConfig;
  
  /** Callback to check if this handler is current */
  isCurrentHandler: () => boolean;
}
```

## Modifications to Existing Types

### SyncableStore Interface Updates

Add these methods to the existing `SyncableStore` interface:

```typescript
export interface SyncableStore<S extends Schema> {
  // ... existing methods ...
  
  /**
   * Get handler for current account.
   * Throws if no account is connected.
   */
  getHandler(): AccountHandler<S>;
  
  /**
   * Get handler for specific account.
   * Creates handler if it doesn't exist.
   */
  getHandlerFor(account: `0x${string}`): AccountHandler<S>;
  
  /**
   * Current account address or undefined.
   */
  readonly currentAccount: `0x${string}` | undefined;
  
  /**
   * Check if there's a current account.
   */
  readonly hasAccount: boolean;
}
```

## Implementation Notes

### isCurrent Property

The `isCurrent` property is computed by comparing handler's account to the store's current account:

```typescript
get isCurrent(): boolean {
  return this.config.isCurrentHandler();
}
```

The `isCurrentHandler` callback is provided by the store when creating the handler.

### Background Mutation Behavior

When a mutation method is called and `isCurrent` is false:

```typescript
function checkBackgroundMutation(): void {
  if (!this.isCurrent) {
    switch (this.backgroundMutationBehavior) {
      case 'throw':
        throw new Error(`Cannot mutate handler for ${this.account}: not current account`);
      case 'warn':
        console.warn(`Mutating background handler for ${this.account}`);
        break;
      case 'allow':
        // Silent proceed
        break;
    }
  }
}
```

## Checklist

- [ ] Add `AccountHandler<S>` interface to `types.ts`
- [ ] Add `AccountAsyncState<T>` type to `types.ts`
- [ ] Add `AccountHandlerConfig<S>` type to `types.ts`
- [ ] Update `SyncableStore<S>` interface with new methods
- [ ] Export new types from `index.ts`

## Next Phase

After completing type definitions, proceed to [02-account-handler-impl.md](./02-account-handler-impl.md) to implement the handler.
