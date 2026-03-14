# Phase 5: Tests

## Overview

Comprehensive test suite for the account handler refactoring. Tests should verify handler isolation, account switching, event forwarding, and async safety.

## Test File Locations

```
web/test/lib/core/sync/
├── accountHandler.test.ts      # Handler unit tests
├── accountSwitching.test.ts    # Account switching integration tests
├── eventForwarding.test.ts     # Event forwarding tests
├── asyncSafety.test.ts         # Async application code tests
└── testUtils.ts                # Shared test utilities
```

## Test Utilities

### `testUtils.ts`

```typescript
import {createSyncableStore, type SyncableStore, type AccountHandler} from '$lib/core/sync';
import type {Schema, InternalStorage, SyncAdapter, PullResponse, PushResponse} from '$lib/core/sync/types';
import {defineSchema, permanent, map} from '$lib/core/sync/types';

// ============ Test Schema ============

export const testSchema = defineSchema({
  settings: permanent<{value: number}>(),
  items: map<{name: string}>(),
});

export type TestSchema = typeof testSchema;
export type TestData = {
  settings: {value: number};
  items: Record<string, {name: string; deleteAt: number}>;
};

// ============ Mock Storage ============

export function createMockStorage() {
  const store = new Map<string, unknown>();
  let saveDelay = 0;
  let shouldFail = false;
  let failError = new Error('Storage failed');
  let saveCount = 0;

  return {
    async load(key: string) {
      return (store.get(key) as InternalStorage<TestSchema>) ?? null;
    },

    async save(key: string, data: unknown) {
      saveCount++;
      await new Promise((r) => setTimeout(r, saveDelay));
      if (shouldFail) throw failError;
      store.set(key, data);
    },

    // Test helpers
    setSaveDelay(ms: number) {
      saveDelay = ms;
    },
    setFailure(fail: boolean, error?: Error) {
      shouldFail = fail;
      if (error) failError = error;
    },
    getSaveCount() {
      return saveCount;
    },
    getData(key: string) {
      return store.get(key);
    },
    clear() {
      store.clear();
      saveCount = 0;
    },
  };
}

// ============ Mock Account Store ============

export function createMockAccountStore() {
  let account: `0x${string}` | undefined = undefined;
  const subscribers = new Set<(a: typeof account) => void>();

  return {
    get current() {
      return account;
    },
    subscribe(cb: (a: typeof account) => void) {
      subscribers.add(cb);
      cb(account);
      return () => subscribers.delete(cb);
    },
    setAccount(a: typeof account) {
      account = a;
      subscribers.forEach((cb) => cb(account));
    },
  };
}

// ============ Mock Sync Adapter ============

export function createMockSyncAdapter(): SyncAdapter<TestSchema> & {
  setPullDelay: (ms: number) => void;
  setPushDelay: (ms: number) => void;
  setFailure: (fail: boolean) => void;
  setServerData: (data: InternalStorage<TestSchema> | null) => void;
  getServerData: () => InternalStorage<TestSchema> | null;
  getPullCount: () => number;
  getPushCount: () => number;
} {
  let pullDelay = 0;
  let pushDelay = 0;
  let shouldFail = false;
  let serverData: InternalStorage<TestSchema> | null = null;
  let counter = 0n;
  let pullCount = 0;
  let pushCount = 0;

  return {
    async pull(account: `0x${string}`): Promise<PullResponse<TestSchema>> {
      pullCount++;
      await new Promise((r) => setTimeout(r, pullDelay));
      if (shouldFail) throw new Error('Sync pull failed');
      return {data: serverData, counter};
    },

    async push(
      account: `0x${string}`,
      data: InternalStorage<TestSchema>,
      newCounter: bigint,
    ): Promise<PushResponse> {
      pushCount++;
      await new Promise((r) => setTimeout(r, pushDelay));
      if (shouldFail) throw new Error('Sync push failed');
      serverData = data;
      counter = newCounter;
      return {success: true};
    },

    setPullDelay(ms: number) {
      pullDelay = ms;
    },
    setPushDelay(ms: number) {
      pushDelay = ms;
    },
    setFailure(fail: boolean) {
      shouldFail = fail;
    },
    setServerData(data: InternalStorage<TestSchema> | null) {
      serverData = data;
    },
    getServerData() {
      return serverData;
    },
    getPullCount() {
      return pullCount;
    },
    getPushCount() {
      return pushCount;
    },
  };
}

// ============ Store Factory ============

export function createTestStore(options?: {
  sync?: ReturnType<typeof createMockSyncAdapter>;
}) {
  const storage = createMockStorage();
  const accountStore = createMockAccountStore();
  const syncAdapter = options?.sync;

  const store = createSyncableStore({
    schema: testSchema,
    account: accountStore,
    storage,
    storageKey: (account) => `test-${account}`,
    defaultData: () => ({
      settings: {value: 0},
      items: {},
    }),
    schemaVersion: 1,
    sync: syncAdapter,
    syncConfig: {
      debounceMs: 10, // Fast for tests
    },
  });

  return {store, storage, accountStore, syncAdapter};
}

// ============ Wait Helpers ============

export async function waitForReady(
  store: SyncableStore<TestSchema>,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (store.state.status !== 'ready') {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for store to be ready (status: ${store.state.status})`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

export async function waitForIdle(
  store: SyncableStore<TestSchema>,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (store.state.status !== 'idle') {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for store to be idle`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

export async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}
```

## Test Cases

### `accountHandler.test.ts` - Handler Unit Tests

```typescript
import {describe, it, expect, beforeEach} from 'vitest';
import {createAccountHandler} from '$lib/core/sync/accountHandler';
import {createMockStorage, testSchema} from './testUtils';

describe('AccountHandler', () => {
  let storage: ReturnType<typeof createMockStorage>;
  
  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('Initialization', () => {
    it('should start in loading state', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      expect(handler.asyncState.status).toBe('loading');
    });

    it('should load and transition to ready', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      await handler.load();

      expect(handler.asyncState.status).toBe('ready');
      expect(handler.asyncState.data.settings.value).toBe(0);
    });
  });

  describe('Status Isolation', () => {
    it('should have independent status objects', async () => {
      const handlerA = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      const handlerB = createAccountHandler('0xB' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xB',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => false,
      });

      await handlerA.load();
      await handlerB.load();

      // Modify A's status via mutation
      storage.setSaveDelay(100);
      handlerA.set('settings', {value: 1});

      expect(handlerA.storageStatus.isSaving).toBe(true);
      expect(handlerB.storageStatus.isSaving).toBe(false);
    });

    it('should have independent sync errors', async () => {
      // ... similar test for sync errors
    });
  });

  describe('Mutations', () => {
    it('should set permanent field', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      await handler.load();
      handler.set('settings', {value: 42});

      expect(handler.asyncState.data.settings.value).toBe(42);
    });

    it('should add map item', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      await handler.load();
      handler.add('items', 'key1', {name: 'Item 1'}, {deleteAt: Date.now() + 10000});

      expect(handler.asyncState.data.items.key1.name).toBe('Item 1');
    });

    it('should emit events on mutation', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      await handler.load();

      const events: unknown[] = [];
      handler.on('settings:changed', (data) => events.push(data));

      handler.set('settings', {value: 42});

      expect(events).toContainEqual({value: 42});
    });
  });

  describe('Background Mutation Behavior', () => {
    it('should allow mutation on background handler by default', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => false, // Not current
      });

      await handler.load();
      
      // Should not throw
      handler.set('settings', {value: 42});
      expect(handler.asyncState.data.settings.value).toBe(42);
    });

    it('should throw when backgroundMutationBehavior is throw', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => false,
      });

      await handler.load();
      handler.backgroundMutationBehavior = 'throw';

      expect(() => handler.set('settings', {value: 42})).toThrow(
        /not current account/,
      );
    });

    it('should warn when backgroundMutationBehavior is warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => false,
      });

      await handler.load();
      handler.backgroundMutationBehavior = 'warn';

      handler.set('settings', {value: 42});

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('background handler'),
      );
      
      warnSpy.mockRestore();
    });
  });

  describe('Pending Work Detection', () => {
    it('should report hasPendingWork when saving', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      await handler.load();
      storage.setSaveDelay(100);

      handler.set('settings', {value: 42});

      expect(handler.hasPendingWork()).toBe(true);
    });

    it('should report no pending work when idle', async () => {
      const handler = createAccountHandler('0xA' as `0x${string}`, {
        schema: testSchema,
        storage,
        storageKey: 'test-0xA',
        defaultData: () => ({settings: {value: 0}, items: {}}),
        clock: Date.now,
        schemaVersion: 1,
        isCurrentHandler: () => true,
      });

      await handler.load();
      await handler.flush();

      expect(handler.hasPendingWork()).toBe(false);
    });
  });
});
```

### `accountSwitching.test.ts` - Account Switching Tests

```typescript
import {describe, it, expect, beforeEach} from 'vitest';
import {createTestStore, waitForReady, waitFor} from './testUtils';

describe('Account Switching', () => {
  describe('Status Isolation', () => {
    it('should show new account status after switch', async () => {
      const {store, storage, accountStore} = createTestStore();
      store.start();

      // Account A
      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      // Start slow save on A
      storage.setSaveDelay(200);
      store.set('settings', {value: 1});

      expect(store.storageStatusStore).toMatchObject({isSaving: true});

      // Switch to B
      accountStore.setAccount('0xB' as `0x${string}`);
      await waitForReady(store);

      // B should NOT show saving
      let status: any;
      store.storageStatusStore.subscribe((s) => (status = s));
      expect(status.isSaving).toBe(false);

      store.stop();
    });

    it('should preserve error on handler when switching', async () => {
      const {store, storage, accountStore} = createTestStore();
      store.start();

      // Account A with error
      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      storage.setFailure(true, new Error('A storage error'));
      store.set('settings', {value: 1});

      await waitFor(() => {
        let status: any;
        store.storageStatusStore.subscribe((s) => (status = s));
        return status.storageError !== null;
      });

      // Switch to B
      storage.setFailure(false);
      accountStore.setAccount('0xB' as `0x${string}`);
      await waitForReady(store);

      // B should NOT have error
      let status: any;
      store.storageStatusStore.subscribe((s) => (status = s));
      expect(status.storageError).toBeNull();

      // Switch back to A - should still have error
      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      store.storageStatusStore.subscribe((s) => (status = s));
      expect(status.storageError?.message).toBe('A storage error');

      store.stop();
    });
  });

  describe('Background Completion', () => {
    it('should complete save after switching away', async () => {
      const {store, storage, accountStore} = createTestStore();
      store.start();

      // Account A
      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      // Start slow save on A
      storage.setSaveDelay(100);
      store.set('settings', {value: 42});

      // Immediately switch to B
      accountStore.setAccount('0xB' as `0x${string}`);
      await waitForReady(store);

      // Wait for A's save to complete
      await new Promise((r) => setTimeout(r, 150));

      // A's data should be saved
      const savedData = storage.getData('test-0xA');
      expect(savedData?.data.settings.value).toBe(42);

      store.stop();
    });
  });

  describe('Handler Reuse', () => {
    it('should reuse handler on switch back', async () => {
      const {store, accountStore} = createTestStore();
      store.start();

      // Account A
      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      store.set('settings', {value: 42});
      await store.flush();

      // Switch to B
      accountStore.setAccount('0xB' as `0x${string}`);
      await waitForReady(store);

      // Switch back to A
      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      // Should still have A's data
      expect(store.state.data.settings.value).toBe(42);

      store.stop();
    });
  });
});
```

### `eventForwarding.test.ts` - Event Forwarding Tests

```typescript
import {describe, it, expect, beforeEach} from 'vitest';
import {createTestStore, waitForReady} from './testUtils';
import type {SyncEvent, StorageEvent} from '$lib/core/sync/types';

describe('Event Forwarding', () => {
  describe('Current Handler Events', () => {
    it('should forward events from current handler', async () => {
      const {store, accountStore} = createTestStore();
      store.start();

      const events: unknown[] = [];
      store.on('settings:changed', (data) => events.push(data));

      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      store.set('settings', {value: 42});

      expect(events).toContainEqual({value: 42});

      store.stop();
    });

    it('should forward storage events from current handler', async () => {
      const {store, accountStore} = createTestStore();
      store.start();

      const events: StorageEvent[] = [];
      store.on('$store:storage', (e) => events.push(e));

      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      store.set('settings', {value: 42});

      expect(events.some((e) => e.type === 'saving')).toBe(true);

      store.stop();
    });
  });

  describe('Background Handler Events', () => {
    it('should NOT forward events from background handler', async () => {
      const {store, storage, accountStore} = createTestStore();
      store.start();

      accountStore.setAccount('0xA' as `0x${string}`);
      await waitForReady(store);

      const handlerA = store.getHandler();

      // Switch to B
      accountStore.setAccount('0xB' as `0x${string}`);
      await waitForReady(store);

      // Collect events
      const events: unknown[] = [];
      store.on('settings:changed', (data) => events.push(data));

      // Mutate A's handler (now background)
      handlerA.set('settings', {value: 99});

      // Wait a tick
      await new Promise((r) => setTimeout(r, 10));

      // Should NOT have A's event
      expect(events).not.toContainEqual({value: 99});

      store.stop();
    });
  });
});
```

### `asyncSafety.test.ts` - Async Application Code Tests

```typescript
import {describe, it, expect} from 'vitest';
import {createTestStore, waitForReady} from './testUtils';

describe('Async Application Code Safety', () => {
  it('should allow mutation on captured handler after switch', async () => {
    const {store, storage, accountStore} = createTestStore();
    store.start();

    accountStore.setAccount('0xA' as `0x${string}`);
    await waitForReady(store);

    const handlerA = store.getHandler();

    // Switch to B
    accountStore.setAccount('0xB' as `0x${string}`);
    await waitForReady(store);

    // Mutate A via captured handler
    handlerA.set('settings', {value: 42});
    await handlerA.flush();

    // A's data should be updated
    const savedData = storage.getData('test-0xA');
    expect(savedData?.data.settings.value).toBe(42);

    // B's data unaffected
    expect(store.state.data.settings.value).toBe(0);

    store.stop();
  });

  it('should report isCurrent correctly', async () => {
    const {store, accountStore} = createTestStore();
    store.start();

    accountStore.setAccount('0xA' as `0x${string}`);
    await waitForReady(store);

    const handlerA = store.getHandler();
    expect(handlerA.isCurrent).toBe(true);

    accountStore.setAccount('0xB' as `0x${string}`);
    await waitForReady(store);

    expect(handlerA.isCurrent).toBe(false);

    store.stop();
  });

  it('should support async workflow pattern', async () => {
    const {store, storage, accountStore} = createTestStore();
    store.start();

    accountStore.setAccount('0xA' as `0x${string}`);
    await waitForReady(store);

    // Simulate async workflow
    async function asyncWorkflow() {
      const handler = store.getHandler(); // Capture

      // Simulate API call
      await new Promise((r) => setTimeout(r, 50));

      // Account might have changed, but handler is safe
      handler.set('settings', {value: 100});
    }

    // Start workflow
    const workflowPromise = asyncWorkflow();

    // Switch account mid-workflow
    await new Promise((r) => setTimeout(r, 10));
    accountStore.setAccount('0xB' as `0x${string}`);

    // Wait for workflow
    await workflowPromise;

    // A's data should be updated
    const savedData = storage.getData('test-0xA');
    expect(savedData?.data.settings.value).toBe(100);

    store.stop();
  });
});
```

## Checklist

- [ ] Create test utilities file
- [ ] Write AccountHandler unit tests
  - [ ] Initialization tests
  - [ ] Status isolation tests
  - [ ] Mutation tests
  - [ ] Background mutation behavior tests
  - [ ] Pending work detection tests
- [ ] Write account switching tests
  - [ ] Status isolation tests
  - [ ] Background completion tests
  - [ ] Handler reuse tests
- [ ] Write event forwarding tests
  - [ ] Current handler event tests
  - [ ] Background handler event tests
- [ ] Write async safety tests
  - [ ] Captured handler mutation tests
  - [ ] isCurrent property tests
  - [ ] Async workflow pattern tests
- [ ] Run all tests and ensure passing
- [ ] Add test coverage for edge cases

## Running Tests

```bash
cd web
pnpm test:unit
```

Or for watch mode:

```bash
pnpm test:unit --watch
```
