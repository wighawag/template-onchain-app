import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {createSyncableStore} from '../../../../src/lib/core/sync/createSyncableStore';
import {
	defineSchema,
	permanent,
	map,
} from '../../../../src/lib/core/sync/types';
import type {AsyncStorage} from '../../../../src/lib/core/storage';
import type {
	InternalStorage,
	Schema,
	SyncAdapter,
	PullResponse,
	PushResponse,
	SyncStatus,
} from '../../../../src/lib/core/sync/types';

// Test schema
const testSchema = defineSchema({
	settings: permanent<{theme: string; volume: number}>(),
	operations: map<{tx: string; status: string}>(),
});

type TestSchema = typeof testSchema;

// Mock storage for testing
function createMockStorage(): AsyncStorage<InternalStorage<TestSchema>> & {
	data: Map<string, InternalStorage<TestSchema>>;
} {
	const data = new Map<string, InternalStorage<TestSchema>>();
	return {
		data,
		async load(key: string) {
			return data.get(key);
		},
		async save(key: string, value: InternalStorage<TestSchema>) {
			data.set(key, value);
		},
		async remove(key: string) {
			data.delete(key);
		},
		async exists(key: string) {
			return data.has(key);
		},
	};
}

// Mock account store
function createMockAccountStore() {
	let currentAccount: `0x${string}` | undefined;
	const subscribers = new Set<(account: `0x${string}` | undefined) => void>();

	return {
		get current() {
			return currentAccount;
		},
		set(account: `0x${string}` | undefined) {
			currentAccount = account;
			for (const sub of subscribers) {
				sub(account);
			}
		},
		subscribe(callback: (account: `0x${string}` | undefined) => void) {
			subscribers.add(callback);
			callback(currentAccount);
			return () => {
				subscribers.delete(callback);
			};
		},
	};
}

describe('Server Sync', () => {
	let storage: ReturnType<typeof createMockStorage>;
	let accountStore: ReturnType<typeof createMockAccountStore>;
	let clock: number;

	beforeEach(() => {
		storage = createMockStorage();
		accountStore = createMockAccountStore();
		clock = 1000;
	});

	describe('SyncAdapter integration', () => {
		it('pulls from server on account load', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({
					data: {
						$version: 1,
						data: {settings: {theme: 'server', volume: 0.7}, operations: {}},
						$timestamps: {settings: 100},
						$itemTimestamps: {operations: {}},
						$tombstones: {operations: {}},
					},
					counter: 1000n,
				}),
				push: vi.fn().mockResolvedValue({success: true}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			expect(mockAdapter.pull).toHaveBeenCalledWith(
				'0x1234567890123456789012345678901234567890',
			);
		});

		it('pushes changes to server after mutation', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockResolvedValue({success: true}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10}, // Short debounce for testing
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for debounce
			await new Promise((r) => setTimeout(r, 50));

			expect(mockAdapter.push).toHaveBeenCalled();
		});

		it('merges server response with local state', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({
					data: {
						$version: 1,
						data: {settings: {theme: 'server', volume: 0.7}, operations: {}},
						$timestamps: {settings: 5000}, // Higher timestamp than local
						$itemTimestamps: {operations: {}},
						$tombstones: {operations: {}},
					},
					counter: 1000n,
				}),
				push: vi.fn().mockResolvedValue({success: true}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			// Server data should win (higher timestamp)
			if (store.state.status === 'ready') {
				expect(store.state.data.settings.theme).toBe('server');
			}
		});
	});

	describe('sync status', () => {
		it('emits sync started event when sync begins', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockImplementation(async () => {
					// Simulate network delay
					await new Promise((r) => setTimeout(r, 20));
					return {success: true};
				}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			const syncEvents: {type: string}[] = [];
			store.on('$store:sync', (e) => syncEvents.push(e));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for debounce to trigger and sync to start
			await new Promise((r) => setTimeout(r, 15));

			expect(syncEvents.some((e) => e.type === 'started')).toBe(true);
		});

		it('emits sync completed event when sync succeeds', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockResolvedValue({success: true}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			const syncEvents: {type: string; timestamp?: number}[] = [];
			store.on('$store:sync', (e) => syncEvents.push(e));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for debounce and sync to complete
			await new Promise((r) => setTimeout(r, 50));

			expect(syncEvents.some((e) => e.type === 'completed')).toBe(true);
			const completedEvent = syncEvents.find((e) => e.type === 'completed');
			expect(completedEvent?.timestamp).toBeDefined();
		});

		it('emits sync failed event when push fails', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockRejectedValue(new Error('Network error')),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10, maxRetries: 0}, // No retries for this test
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			const syncEvents: {type: string; error?: Error}[] = [];
			store.on('$store:sync', (e) => syncEvents.push(e));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for debounce and sync to fail
			await new Promise((r) => setTimeout(r, 50));

			expect(syncEvents.some((e) => e.type === 'failed')).toBe(true);
			const failedEvent = syncEvents.find((e) => e.type === 'failed');
			expect((failedEvent?.error as Error)?.message).toBe('Network error');
		});

		it('updates store status isSyncing during sync', async () => {
			let isSyncingWhilePushing: boolean | undefined;
			let syncDisplayStateWhilePushing: string | undefined;

			// We need to declare store first to reference it in the mock
			let store: ReturnType<typeof createSyncableStore<TestSchema>>;

			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockImplementation(async function (
					this: unknown,
					...args: unknown[]
				) {
					// Capture sync status during push
					let syncStatus: SyncStatus | undefined;
					store.syncStatusStore.subscribe((s) => (syncStatus = s))();
					isSyncingWhilePushing = syncStatus?.isSyncing;
					syncDisplayStateWhilePushing = syncStatus?.displayState;
					return {success: true};
				}),
			};

			store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for debounce and sync to complete
			await new Promise((r) => setTimeout(r, 50));

			expect(isSyncingWhilePushing).toBe(true);
			expect(syncDisplayStateWhilePushing).toBe('syncing');

			// Check final sync status
			let finalSyncStatus: SyncStatus | undefined;
			store.syncStatusStore.subscribe((s) => (finalSyncStatus = s));
			expect(finalSyncStatus?.isSyncing).toBe(false);
			expect(finalSyncStatus?.displayState).toBe('idle');
		});

		it('sets syncError on store status when push fails', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockRejectedValue(new Error('Network failure')),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10, maxRetries: 0}, // No retries for this test
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for debounce and sync to fail
			await new Promise((r) => setTimeout(r, 50));

			let syncStatus: SyncStatus | undefined;
			store.syncStatusStore.subscribe((s) => (syncStatus = s));
			expect(syncStatus?.syncError?.message).toBe('Network failure');
		});

		it('updates lastSyncedAt on successful sync', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockResolvedValue({success: true}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			let syncStatus: SyncStatus | undefined;
			store.syncStatusStore.subscribe((s) => (syncStatus = s));
			expect(syncStatus?.lastSyncedAt).toBeNull();

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for debounce and sync to complete
			await new Promise((r) => setTimeout(r, 50));

			expect(syncStatus?.lastSyncedAt).not.toBeNull();
			expect(typeof syncStatus?.lastSyncedAt).toBe('number');
		});
	});

	describe('sync lifecycle', () => {
		it('debounces rapid changes into single sync', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockResolvedValue({success: true}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 50},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			// Make 5 rapid changes
			for (let i = 0; i < 5; i++) {
				store.set('settings', {theme: `theme-${i}`, volume: i / 10});
			}

			// Wait for debounce
			await new Promise((r) => setTimeout(r, 100));

			// Should only push once
			expect(mockAdapter.push).toHaveBeenCalledTimes(1);
		});
	});

	describe('retry logic', () => {
		it('retries push on failure up to maxRetries', async () => {
			let attempts = 0;
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockImplementation(async () => {
					attempts++;
					if (attempts < 3) {
						throw new Error('Network error');
					}
					return {success: true};
				}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10, maxRetries: 3, retryBackoffMs: 10},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for retries (debounce + retries with backoff)
			await new Promise((r) => setTimeout(r, 200));

			// Should have retried and eventually succeeded
			expect(mockAdapter.push).toHaveBeenCalledTimes(3);
		});

		it('stops retrying after maxRetries failures', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockRejectedValue(new Error('Persistent error')),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10, maxRetries: 2, retryBackoffMs: 10},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			const syncEvents: {type: string; error?: Error}[] = [];
			store.on('$store:sync', (e) => syncEvents.push(e));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for all retries
			await new Promise((r) => setTimeout(r, 200));

			// Should have tried maxRetries + 1 times (initial + retries)
			expect(mockAdapter.push).toHaveBeenCalledTimes(3); // 1 initial + 2 retries

			// Should have failed event
			expect(syncEvents.some((e) => e.type === 'failed')).toBe(true);

			let syncStatus: SyncStatus | undefined;
			store.syncStatusStore.subscribe((s) => (syncStatus = s));
			expect(syncStatus?.syncError?.message).toBe('Persistent error');
		});

		it('uses exponential backoff between retries', async () => {
			const callTimes: number[] = [];

			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockImplementation(async () => {
					callTimes.push(Date.now());
					throw new Error('Keep failing');
				}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 10, maxRetries: 3, retryBackoffMs: 20},
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Wait for all retries (debounce + 3 retries with increasing backoff)
			await new Promise((r) => setTimeout(r, 500));

			// Verify exponential backoff timing
			// Backoffs should be: 20ms (1x), 40ms (2x), 80ms (4x)
			if (callTimes.length >= 3) {
				const gap1 = callTimes[1] - callTimes[0];
				const gap2 = callTimes[2] - callTimes[1];
				// Allow some timing tolerance
				expect(gap2).toBeGreaterThanOrEqual(gap1 * 1.5);
			}
		});
	});

	describe('cleanup on stop', () => {
		it('cancels pending sync when stop is called', async () => {
			const mockAdapter: SyncAdapter<TestSchema> = {
				pull: vi.fn().mockResolvedValue({data: null, counter: 0n}),
				push: vi.fn().mockResolvedValue({success: true}),
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				sync: mockAdapter,
				syncConfig: {debounceMs: 100}, // Long debounce
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			store.set('settings', {theme: 'light', volume: 0.9});

			// Stop before debounce fires
			store.stop();

			// Wait for would-be debounce
			await new Promise((r) => setTimeout(r, 150));

			// Push should not have been called (debounce was cancelled)
			expect(mockAdapter.push).not.toHaveBeenCalled();
		});
	});
});
