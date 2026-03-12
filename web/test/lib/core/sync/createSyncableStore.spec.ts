import {describe, it, expect, beforeEach} from 'vitest';
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
	AsyncState,
	DataOf,
	PullResponse,
	PushResponse,
	SyncAdapter,
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

// Helper to create a mock sync adapter with the new interface
function createMockSyncAdapter(options?: {
	onPull?: () => Promise<PullResponse<TestSchema>>;
	onPush?: (
		account: `0x${string}`,
		data: InternalStorage<TestSchema>,
		counter: bigint,
	) => Promise<PushResponse>;
	pullCount?: {value: number};
	pushCount?: {value: number};
}): SyncAdapter<TestSchema> {
	const {
		onPull = async () => ({data: null, counter: 0n}),
		onPush = async () => ({success: true}),
		pullCount,
		pushCount,
	} = options ?? {};

	return {
		async pull(account: `0x${string}`) {
			if (pullCount) pullCount.value++;
			return onPull();
		},
		async push(
			account: `0x${string}`,
			data: InternalStorage<TestSchema>,
			counter: bigint,
		) {
			if (pushCount) pushCount.value++;
			return onPush(account, data, counter);
		},
	};
}

describe('createSyncableStore', () => {
	let storage: ReturnType<typeof createMockStorage>;
	let accountStore: ReturnType<typeof createMockAccountStore>;
	let clock: number;

	beforeEach(() => {
		storage = createMockStorage();
		accountStore = createMockAccountStore();
		clock = 1000;
	});

	it('starts in idle state when no account is set', () => {
		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		expect(store.state.status).toBe('idle');
	});

	it('transitions to ready state when account is set', async () => {
		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		// Set an account
		accountStore.set('0x1234567890123456789012345678901234567890');

		// Wait for async load
		await new Promise((r) => setTimeout(r, 10));

		expect(store.state.status).toBe('ready');
		expect(store.state.account).toBe(
			'0x1234567890123456789012345678901234567890',
		);
	});

	it('sets permanent field value', async () => {
		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		accountStore.set('0x1234567890123456789012345678901234567890');
		await new Promise((r) => setTimeout(r, 10));

		store.set('settings', {theme: 'light', volume: 0.8});

		if (store.state.status === 'ready') {
			expect(store.state.data.settings.theme).toBe('light');
			expect(store.state.data.settings.volume).toBe(0.8);
		} else {
			expect.fail('Store should be ready');
		}
	});

	it('adds item to map field with deleteAt', async () => {
		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		accountStore.set('0x1234567890123456789012345678901234567890');
		await new Promise((r) => setTimeout(r, 10));

		store.add(
			'operations',
			'op-1',
			{tx: '0xabc', status: 'pending'},
			{deleteAt: 9999},
		);

		if (store.state.status === 'ready') {
			expect(store.state.data.operations['op-1']).toBeDefined();
			expect(store.state.data.operations['op-1'].tx).toBe('0xabc');
			expect(store.state.data.operations['op-1'].status).toBe('pending');
			expect(store.state.data.operations['op-1'].deleteAt).toBe(9999);
		} else {
			expect.fail('Store should be ready');
		}
	});

	it('updates existing map item', async () => {
		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		accountStore.set('0x1234567890123456789012345678901234567890');
		await new Promise((r) => setTimeout(r, 10));

		store.add(
			'operations',
			'op-1',
			{tx: '0xabc', status: 'pending'},
			{deleteAt: 9999},
		);
		clock = 2000; // Advance clock
		store.update('operations', 'op-1', {tx: '0xabc', status: 'confirmed'});

		if (store.state.status === 'ready') {
			expect(store.state.data.operations['op-1'].status).toBe('confirmed');
		} else {
			expect.fail('Store should be ready');
		}
	});

	it('removes map item by creating tombstone', async () => {
		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		accountStore.set('0x1234567890123456789012345678901234567890');
		await new Promise((r) => setTimeout(r, 10));

		store.add(
			'operations',
			'op-1',
			{tx: '0xabc', status: 'pending'},
			{deleteAt: 9999},
		);
		store.remove('operations', 'op-1');

		if (store.state.status === 'ready') {
			expect(store.state.data.operations['op-1']).toBeUndefined();
		} else {
			expect.fail('Store should be ready');
		}
	});

	it('persists data to storage', async () => {
		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		accountStore.set('0x1234567890123456789012345678901234567890');
		await new Promise((r) => setTimeout(r, 10));

		store.set('settings', {theme: 'light', volume: 0.9});

		// Wait for async save
		await new Promise((r) => setTimeout(r, 10));

		// Check storage
		const saved = storage.data.get(
			'test-0x1234567890123456789012345678901234567890',
		) as any;
		expect(saved).toBeDefined();
		expect(saved.data.settings.theme).toBe('light');
	});

	it('loads existing data from storage', async () => {
		// Pre-populate storage
		storage.data.set('test-0x1234567890123456789012345678901234567890', {
			$version: 1,
			data: {
				settings: {theme: 'custom', volume: 0.3},
				operations: {
					'existing-op': {tx: '0xdef', status: 'confirmed', deleteAt: 99999},
				},
			},
			$timestamps: {settings: 500},
			$itemTimestamps: {operations: {'existing-op': 400}},
			$tombstones: {operations: {}},
		});

		const store = createSyncableStore({
			schema: testSchema,
			account: accountStore,
			storage,
			storageKey: (addr) => `test-${addr}`,
			defaultData: () => ({
				settings: {theme: 'dark', volume: 0.5},
				operations: {},
			}),
			clock: () => clock,
		});
		store.start();

		accountStore.set('0x1234567890123456789012345678901234567890');
		await new Promise((r) => setTimeout(r, 10));

		if (store.state.status === 'ready') {
			expect(store.state.data.settings.theme).toBe('custom');
			expect(store.state.data.operations['existing-op']).toBeDefined();
		} else {
			expect.fail('Store should be ready');
		}
	});

	describe('type-safe events', () => {
		it('emits settings:changed event when permanent field is set', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			let receivedValue: {theme: string; volume: number} | undefined;
			store.on('settings:changed', (value) => {
				receivedValue = value;
			});

			store.set('settings', {theme: 'light', volume: 0.9});

			expect(receivedValue).toEqual({theme: 'light', volume: 0.9});
		});

		it('emits operations:added event when item is added', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			let receivedEvent:
				| {key: string; item: {tx: string; status: string; deleteAt: number}}
				| undefined;
			store.on('operations:added', (event) => {
				receivedEvent = event;
			});

			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			expect(receivedEvent?.key).toBe('op-1');
			expect(receivedEvent?.item.tx).toBe('0xabc');
			expect(receivedEvent?.item.deleteAt).toBe(9999);
		});

		it('emits operations:updated event when item is updated', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			let receivedEvent:
				| {key: string; item: {tx: string; status: string; deleteAt: number}}
				| undefined;
			store.on('operations:updated', (event) => {
				receivedEvent = event;
			});

			store.update('operations', 'op-1', {tx: '0xabc', status: 'confirmed'});

			expect(receivedEvent?.key).toBe('op-1');
			expect(receivedEvent?.item.status).toBe('confirmed');
		});

		it('emits operations:removed event when item is removed', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			let receivedEvent:
				| {key: string; item: {tx: string; status: string; deleteAt: number}}
				| undefined;
			store.on('operations:removed', (event) => {
				receivedEvent = event;
			});

			store.remove('operations', 'op-1');

			expect(receivedEvent?.key).toBe('op-1');
		});

		it('emits state event with AsyncState payload', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			const events: AsyncState<DataOf<TestSchema>>[] = [];
			store.on('state', (state) => events.push(state));

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			expect(events.length).toBeGreaterThan(0);
			expect(events[events.length - 1].status).toBe('ready');
		});

		it('emits settings:changed event on patch()', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			let receivedValue: {theme: string; volume: number} | undefined;
			store.on('settings:changed', (value) => {
				receivedValue = value;
			});

			store.patch('settings', {volume: 0.9});

			expect(receivedValue?.volume).toBe(0.9);
			expect(receivedValue?.theme).toBe('dark'); // original value preserved
		});
	});

	describe('getItemStore', () => {
		it('returns undefined when store is not ready', () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			// Store is idle - no account set
			let itemValue: unknown;
			const itemStore = store.getItemStore('operations', 'op-1');
			itemStore.subscribe((v) => (itemValue = v));

			expect(itemValue).toBeUndefined();
		});

		it('returns item value when it exists', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			// Add an item first
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			// Get item store and subscribe
			let itemValue: {tx: string; status: string; deleteAt: number} | undefined;
			const itemStore = store.getItemStore('operations', 'op-1');
			itemStore.subscribe((v) => (itemValue = v));

			expect(itemValue).toBeDefined();
			expect(itemValue?.tx).toBe('0xabc');
			expect(itemValue?.status).toBe('pending');
			expect(itemValue?.deleteAt).toBe(9999);
		});

		it('updates when item is added', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			// Subscribe to item store BEFORE adding item
			let itemValue: {tx: string; status: string; deleteAt: number} | undefined;
			const itemStore = store.getItemStore('operations', 'op-1');
			itemStore.subscribe((v) => (itemValue = v));

			// Initially undefined
			expect(itemValue).toBeUndefined();

			// Add the item
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			// Should be updated
			expect(itemValue).toBeDefined();
			expect(itemValue?.tx).toBe('0xabc');
		});

		it('updates when item is updated', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			// Add an item first
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			// Subscribe to item store
			let itemValue: {tx: string; status: string; deleteAt: number} | undefined;
			const itemStore = store.getItemStore('operations', 'op-1');
			itemStore.subscribe((v) => (itemValue = v));

			expect(itemValue?.status).toBe('pending');

			// Update the item
			clock = 2000;
			store.update('operations', 'op-1', {tx: '0xabc', status: 'confirmed'});

			// Should be updated
			expect(itemValue?.status).toBe('confirmed');
		});

		it('returns undefined when item is removed', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			// Add an item first
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			// Subscribe to item store
			let itemValue: {tx: string; status: string; deleteAt: number} | undefined;
			const itemStore = store.getItemStore('operations', 'op-1');
			itemStore.subscribe((v) => (itemValue = v));

			expect(itemValue).toBeDefined();

			// Remove the item
			store.remove('operations', 'op-1');

			// Should be undefined
			expect(itemValue).toBeUndefined();
		});

		it('returns cached store instance for same field/key', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			// Get item store twice for same key
			const itemStore1 = store.getItemStore('operations', 'op-1');
			const itemStore2 = store.getItemStore('operations', 'op-1');

			// Should be the same instance
			expect(itemStore1).toBe(itemStore2);

			// Different key should return different instance
			const itemStore3 = store.getItemStore('operations', 'op-2');
			expect(itemStore1).not.toBe(itemStore3);
		});

		it('clears cache on account switch', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			// First account
			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			const itemStore1 = store.getItemStore('operations', 'op-1');

			// Switch to different account
			accountStore.set('0x0000000000000000000000000000000000000001');
			await new Promise((r) => setTimeout(r, 10));

			const itemStore2 = store.getItemStore('operations', 'op-1');

			// Should be different instances after account switch
			expect(itemStore1).not.toBe(itemStore2);
		});
	});

	describe('statusStore', () => {
		it('provides current status on subscribe', () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			let receivedStatus:
				| {
						syncState: string;
						hasPendingSync: boolean;
						storageState: string;
				  }
				| undefined;
			store.statusStore.subscribe((status) => {
				receivedStatus = status;
			});

			expect(receivedStatus).toBeDefined();
			expect(receivedStatus?.syncState).toBe('idle');
			expect(receivedStatus?.storageState).toBe('idle');
			expect(receivedStatus?.hasPendingSync).toBe(false);
		});

		it('notifies when syncState changes', async () => {
			let pushResolve: (() => void) | undefined;
			const pushPromise = new Promise<void>((resolve) => {
				pushResolve = resolve;
			});

			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					// Wait a bit to simulate network delay
					await pushPromise;
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 10},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Track status changes
			const statusHistory: string[] = [];
			store.statusStore.subscribe((status) => {
				statusHistory.push(status.syncState);
			});

			// Trigger sync by making a change
			store.set('settings', {theme: 'light', volume: 0.8});

			// Wait for sync to start
			await new Promise((r) => setTimeout(r, 50));

			// At this point, sync should be in 'syncing' state
			expect(statusHistory).toContain('syncing');

			// Complete the sync
			pushResolve!();
			await new Promise((r) => setTimeout(r, 20));

			// Should be back to idle
			expect(statusHistory[statusHistory.length - 1]).toBe('idle');
		});

		it('notifies when storageState changes', async () => {
			// Create a slow storage that we can control
			let saveResolve: (() => void) | undefined;
			const savePromise = new Promise<void>((resolve) => {
				saveResolve = resolve;
			});
			let firstSave = true;

			const slowStorage: AsyncStorage<InternalStorage<TestSchema>> = {
				async load(key: string) {
					return storage.data.get(key);
				},
				async save(key: string, value: InternalStorage<TestSchema>) {
					if (!firstSave) {
						// After the initial save, wait for our signal
						await savePromise;
					}
					firstSave = false;
					storage.data.set(key, value);
				},
				async remove(key: string) {
					storage.data.delete(key);
				},
				async exists(key: string) {
					return storage.data.has(key);
				},
			};

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage: slowStorage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Track status changes
			const statusHistory: string[] = [];
			store.statusStore.subscribe((status) => {
				statusHistory.push(status.storageState);
			});

			// Trigger storage save by making a change
			store.set('settings', {theme: 'light', volume: 0.8});

			// Give it time to start saving
			await new Promise((r) => setTimeout(r, 10));

			// Should show 'saving' in history
			expect(statusHistory).toContain('saving');

			// Complete the save
			saveResolve!();
			await new Promise((r) => setTimeout(r, 10));

			// Should be back to idle
			expect(statusHistory[statusHistory.length - 1]).toBe('idle');
		});
	});

	describe('syncNow', () => {
		it('handles no sync adapter gracefully', async () => {
			// Create store WITHOUT sync adapter
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
				// No sync adapter configured
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Should not throw - just returns without error
			await expect(store.syncNow()).resolves.toBeUndefined();
		});

		it('handles not-ready state gracefully', async () => {
			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
			});
			store.start();

			// Store is still idle (no account set)
			expect(store.state.status).toBe('idle');

			// Should not throw - just returns without error
			await expect(store.syncNow()).resolves.toBeUndefined();
		});

		it('bypasses debounce and syncs immediately', async () => {
			let pushCallCount = 0;
			let pushResolve: (() => void) | undefined;

			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					pushCallCount++;
					await new Promise<void>((resolve) => {
						pushResolve = resolve;
					});
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 5000}, // Long debounce
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Make a change (this would normally start a 5 second debounce)
			store.set('settings', {theme: 'light', volume: 0.8});

			// Sync hasn't started yet (debounce not elapsed)
			expect(pushCallCount).toBe(0);

			// Call syncNow - should bypass debounce
			const syncPromise = store.syncNow();

			// Give it a moment to start
			await new Promise((r) => setTimeout(r, 10));

			// Sync should have started immediately
			expect(pushCallCount).toBe(1);

			// Complete the sync
			pushResolve!();
			await syncPromise;
		});
	});

	describe('pauseSync and resumeSync', () => {
		it('pauseSync prevents scheduled syncs from running', async () => {
			let pushCallCount = 0;

			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					pushCallCount++;
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 20}, // Short debounce
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Pause sync before making changes
			store.pauseSync();

			// Make a change (this would normally trigger sync after debounce)
			store.set('settings', {theme: 'light', volume: 0.8});

			// Wait for longer than debounce
			await new Promise((r) => setTimeout(r, 50));

			// Sync should NOT have happened because it's paused
			expect(pushCallCount).toBe(0);
		});

		it('resumeSync triggers sync if dirty', async () => {
			let pushCallCount = 0;
			let pushResolve: (() => void) | undefined;

			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					pushCallCount++;
					await new Promise<void>((resolve) => {
						pushResolve = resolve;
					});
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 10},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Pause sync before making changes
			store.pauseSync();

			// Make a change
			store.set('settings', {theme: 'light', volume: 0.8});

			// No sync yet
			expect(pushCallCount).toBe(0);

			// Resume sync
			store.resumeSync();

			// Wait for debounce to trigger
			await new Promise((r) => setTimeout(r, 30));

			// Sync should now have started
			expect(pushCallCount).toBe(1);

			// Complete sync
			pushResolve!();
		});

		it('pauseSync clears pending debounce timer', async () => {
			let pushCallCount = 0;

			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					pushCallCount++;
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 50}, // Longer debounce
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Make a change (starts debounce timer)
			store.set('settings', {theme: 'light', volume: 0.8});

			// Pause sync immediately (should clear the pending timer)
			store.pauseSync();

			// Wait for longer than debounce
			await new Promise((r) => setTimeout(r, 80));

			// Sync should NOT have happened because timer was cleared
			expect(pushCallCount).toBe(0);
		});
	});

	describe('syncOnVisible', () => {
		it('can be disabled via syncConfig.syncOnVisible = false', async () => {
			let pullCallCount = 0;
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					pullCallCount++;
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
			};

			// Mock document visibility API
			let visibilityState = 'visible';
			let visibilityHandler: (() => void) | undefined;
			const originalDocument = globalThis.document;

			(globalThis as unknown as {document: unknown}).document = {
				get visibilityState() {
					return visibilityState;
				},
				addEventListener(event: string, handler: () => void) {
					if (event === 'visibilitychange') {
						visibilityHandler = handler;
					}
				},
				removeEventListener() {},
			};

			try {
				const store = createSyncableStore({
					schema: testSchema,
					account: accountStore,
					storage,
					storageKey: (addr) => `test-${addr}`,
					defaultData: () => ({
						settings: {theme: 'dark', volume: 0.5},
						operations: {},
					}),
					clock: () => clock,
					sync: mockSyncAdapter,
					syncConfig: {syncOnVisible: false}, // Disable syncOnVisible
				});
				store.start();

				accountStore.set('0x1234567890123456789012345678901234567890');
				await new Promise((r) => setTimeout(r, 20));

				const initialPullCount = pullCallCount;

				// Simulate tab becoming visible
				visibilityState = 'visible';
				visibilityHandler?.();

				await new Promise((r) => setTimeout(r, 20));

				// Should NOT have triggered an additional pull because disabled
				expect(pullCallCount).toBe(initialPullCount);

				store.stop();
			} finally {
				globalThis.document = originalDocument;
			}
		});

		it('triggers pull when tab becomes visible', async () => {
			let pullCallCount = 0;
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					pullCallCount++;
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
			};

			// Mock document visibility API
			let visibilityState = 'visible';
			let visibilityHandler: (() => void) | undefined;
			const originalDocument = globalThis.document;

			globalThis.document = {
				// @ts-expect-error - mocking document
				get visibilityState() {
					return visibilityState;
				},
				// @ts-expect-error - mocking document
				addEventListener(event: string, handler: () => void) {
					if (event === 'visibilitychange') {
						visibilityHandler = handler;
					}
				},
				removeEventListener() {},
			};

			try {
				const store = createSyncableStore({
					schema: testSchema,
					account: accountStore,
					storage,
					storageKey: (addr) => `test-${addr}`,
					defaultData: () => ({
						settings: {theme: 'dark', volume: 0.5},
						operations: {},
					}),
					clock: () => clock,
					sync: mockSyncAdapter,
				});
				store.start();

				accountStore.set('0x1234567890123456789012345678901234567890');
				await new Promise((r) => setTimeout(r, 20));

				// Record pull count after initial load (may include initial pull)
				const initialPullCount = pullCallCount;

				// Simulate tab becoming hidden then visible
				visibilityState = 'hidden';
				visibilityState = 'visible';
				visibilityHandler?.();

				// Wait for async pull to complete
				await new Promise((r) => setTimeout(r, 20));

				// Should have triggered an additional pull
				expect(pullCallCount).toBeGreaterThan(initialPullCount);

				store.stop();
			} finally {
				globalThis.document = originalDocument;
			}
		});
	});

	describe('syncOnReconnect', () => {
		it('triggers push sync when coming back online', async () => {
			let pushCallCount = 0;
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					pushCallCount++;
					return {success: true};
				},
			};

			// Mock window online/offline events
			let onlineHandler: (() => void) | undefined;
			let offlineHandler: (() => void) | undefined;
			const originalWindow = globalThis.window;

			(globalThis as unknown as {window: unknown}).window = {
				addEventListener(event: string, handler: () => void) {
					if (event === 'online') onlineHandler = handler;
					if (event === 'offline') offlineHandler = handler;
				},
				removeEventListener() {},
			};

			try {
				const store = createSyncableStore({
					schema: testSchema,
					account: accountStore,
					storage,
					storageKey: (addr) => `test-${addr}`,
					defaultData: () => ({
						settings: {theme: 'dark', volume: 0.5},
						operations: {},
					}),
					clock: () => clock,
					sync: mockSyncAdapter,
					syncConfig: {debounceMs: 10},
				});
				store.start();

				accountStore.set('0x1234567890123456789012345678901234567890');
				await new Promise((r) => setTimeout(r, 20));

				const initialPushCount = pushCallCount;

				// Simulate going offline then online
				offlineHandler?.();
				await new Promise((r) => setTimeout(r, 10));
				onlineHandler?.();
				await new Promise((r) => setTimeout(r, 20));

				// Should have triggered a push sync
				expect(pushCallCount).toBeGreaterThan(initialPushCount);

				store.stop();
			} finally {
				globalThis.window = originalWindow;
			}
		});

		it('updates syncState to offline when going offline', async () => {
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
			};

			// Mock window online/offline events
			let offlineHandler: (() => void) | undefined;
			const originalWindow = globalThis.window;

			(globalThis as unknown as {window: unknown}).window = {
				addEventListener(event: string, handler: () => void) {
					if (event === 'offline') offlineHandler = handler;
				},
				removeEventListener() {},
			};

			try {
				const store = createSyncableStore({
					schema: testSchema,
					account: accountStore,
					storage,
					storageKey: (addr) => `test-${addr}`,
					defaultData: () => ({
						settings: {theme: 'dark', volume: 0.5},
						operations: {},
					}),
					clock: () => clock,
					sync: mockSyncAdapter,
				});
				store.start();

				accountStore.set('0x1234567890123456789012345678901234567890');
				await new Promise((r) => setTimeout(r, 20));

				// Initial state should be idle
				expect(store.status.syncState).toBe('idle');

				// Simulate going offline
				offlineHandler?.();

				// Status should be offline
				expect(store.status.syncState).toBe('offline');

				store.stop();
			} finally {
				globalThis.window = originalWindow;
			}
		});

		it('can be disabled via syncConfig.syncOnReconnect = false', async () => {
			let pushCallCount = 0;
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					pushCallCount++;
					return {success: true};
				},
			};

			// Mock window online/offline events
			let onlineHandler: (() => void) | undefined;
			const originalWindow = globalThis.window;

			(globalThis as unknown as {window: unknown}).window = {
				addEventListener(event: string, handler: () => void) {
					if (event === 'online') onlineHandler = handler;
				},
				removeEventListener() {},
			};

			try {
				const store = createSyncableStore({
					schema: testSchema,
					account: accountStore,
					storage,
					storageKey: (addr) => `test-${addr}`,
					defaultData: () => ({
						settings: {theme: 'dark', volume: 0.5},
						operations: {},
					}),
					clock: () => clock,
					sync: mockSyncAdapter,
					syncConfig: {syncOnReconnect: false}, // Disable
				});
				store.start();

				accountStore.set('0x1234567890123456789012345678901234567890');
				await new Promise((r) => setTimeout(r, 20));

				const initialPushCount = pushCallCount;

				// Simulate coming online
				onlineHandler?.();
				await new Promise((r) => setTimeout(r, 20));

				// Should NOT have triggered a push because disabled
				expect(pushCallCount).toBe(initialPushCount);

				store.stop();
			} finally {
				globalThis.window = originalWindow;
			}
		});
	});

	describe('intervalMs - Periodic Sync', () => {
		it('triggers periodic pull at configured interval', async () => {
			let pullCallCount = 0;
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					pullCallCount++;
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {intervalMs: 50}, // Very short interval for testing
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			const initialPullCount = pullCallCount;

			// Wait for two intervals to pass
			await new Promise((r) => setTimeout(r, 120));

			// Should have triggered at least one additional pull
			expect(pullCallCount).toBeGreaterThan(initialPullCount);

			store.stop();
		});

		it('respects 0 to disable periodic sync', async () => {
			let pullCallCount = 0;
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					pullCallCount++;
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {intervalMs: 0}, // Disabled
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			const initialPullCount = pullCallCount;

			// Wait for a period
			await new Promise((r) => setTimeout(r, 100));

			// Should NOT have triggered additional pulls (only initial)
			expect(pullCallCount).toBe(initialPullCount);

			store.stop();
		});

		it('cleans up interval timer on stop', async () => {
			let pullCallCount = 0;
			const mockSyncAdapter = {
				async pull(_account: `0x${string}`) {
					pullCallCount++;
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {intervalMs: 50},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Stop the store
			store.stop();

			const countAfterStop = pullCallCount;

			// Wait for periods to pass
			await new Promise((r) => setTimeout(r, 150));

			// Should NOT have triggered additional pulls after stop
			expect(pullCallCount).toBe(countAfterStop);
		});
	});

	describe('hasPendingSync', () => {
		it('is false when no changes have been made', async () => {
			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// No changes made - should be false
			expect(store.status.hasPendingSync).toBe(false);
		});

		it('becomes true after a mutation is made', async () => {
			// Use a push that will hang to prevent auto-completion
			let pushResolve: (() => void) | undefined;
			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					await new Promise<void>((resolve) => {
						pushResolve = resolve;
					});
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 5000}, // Long debounce so sync doesn't complete
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Initially false
			expect(store.status.hasPendingSync).toBe(false);

			// Make a change
			store.set('settings', {theme: 'light', volume: 0.8});

			// Should now be true - we have pending changes
			expect(store.status.hasPendingSync).toBe(true);

			// Cleanup: resolve the push if it was called
			pushResolve?.();
		});

		it('resets to false after successful sync', async () => {
			let pushResolve: (() => void) | undefined;
			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					await new Promise<void>((resolve) => {
						pushResolve = resolve;
					});
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 10}, // Short debounce
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Make a change
			store.set('settings', {theme: 'light', volume: 0.8});
			expect(store.status.hasPendingSync).toBe(true);

			// Wait for sync to start
			await new Promise((r) => setTimeout(r, 30));

			// Complete the sync
			pushResolve!();
			await new Promise((r) => setTimeout(r, 20));

			// Should be false after successful sync
			expect(store.status.hasPendingSync).toBe(false);
		});

		it('notifies statusStore subscribers when hasPendingSync changes', async () => {
			let pushResolve: (() => void) | undefined;
			const mockSyncAdapter = {
				async pull(): Promise<PullResponse<TestSchema>> {
					return {data: null, counter: 0n};
				},
				async push(
					_account: `0x${string}`,
					data: InternalStorage<TestSchema>,
					counter: bigint,
				): Promise<PushResponse> {
					await new Promise<void>((resolve) => {
						pushResolve = resolve;
					});
					return {success: true};
				},
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
				clock: () => clock,
				sync: mockSyncAdapter,
				syncConfig: {debounceMs: 10},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Track hasPendingSync changes via statusStore
			const pendingHistory: boolean[] = [];
			store.statusStore.subscribe((status) => {
				pendingHistory.push(status.hasPendingSync);
			});

			// Clear initial subscription value
			pendingHistory.length = 0;

			// Make a change - should notify with true
			store.set('settings', {theme: 'light', volume: 0.8});

			// Should have notified with true
			expect(pendingHistory).toContain(true);

			// Wait for sync to start and complete
			await new Promise((r) => setTimeout(r, 30));
			pushResolve!();
			await new Promise((r) => setTimeout(r, 20));

			// Should have notified with false
			expect(pendingHistory).toContain(false);
		});
	});

	describe('state transition events', () => {
		it('emits state events during account load: loading -> ready', async () => {
			// Register listener BEFORE creating store to capture all events
			const events: AsyncState<DataOf<TestSchema>>[] = [];

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			store.on('state', (state) => events.push(state));

			// Set account to trigger loading -> ready
			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			// Should have: loading -> ready
			const statuses = events.map((e) => e.status);
			expect(statuses).toContain('loading');
			expect(statuses[statuses.length - 1]).toBe('ready');
		});

		it('emits state event on account clear: ready -> idle', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			const events: AsyncState<DataOf<TestSchema>>[] = [];
			store.on('state', (state) => events.push(state));

			accountStore.set(undefined);
			await new Promise((r) => setTimeout(r, 10));

			expect(events[events.length - 1].status).toBe('idle');
		});

		it('does NOT emit state event when data is modified (use field events instead)', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			const events: AsyncState<DataOf<TestSchema>>[] = [];
			store.on('state', (state) => events.push(state));

			// Clear any events from the initial setup
			events.length = 0;

			store.set('settings', {theme: 'light', volume: 0.8});

			// State event should NOT be emitted on data modifications
			// (use field-level events like 'settings:changed' instead)
			expect(events.length).toBe(0);
		});
	});

	describe('migrations', () => {
		it('runs migrations sequentially when loading data with older version', async () => {
			// Pre-populate storage with version 1 data
			storage.data.set('test-0x1234567890123456789012345678901234567890', {
				$version: 1,
				data: {
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				},
				$timestamps: {settings: 500},
				$itemTimestamps: {operations: {}},
				$tombstones: {operations: {}},
			});

			// Track migration calls
			const migrationCalls: number[] = [];

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
				schemaVersion: 3, // Target version 3
				migrations: {
					2: (oldData: unknown) => {
						migrationCalls.push(2);
						const data = oldData as any;
						// Migration from v1 to v2: Add 'newField' to settings (simulated)
						return {
							...data,
							$version: 2,
							data: {
								...data.data,
								settings: {
									...data.data.settings,
									migratedFrom: 1,
								},
							},
						};
					},
					3: (oldData: unknown) => {
						migrationCalls.push(3);
						const data = oldData as any;
						// Migration from v2 to v3
						return {
							...data,
							$version: 3,
							data: {
								...data.data,
								settings: {
									...data.data.settings,
									migratedFrom: 2,
								},
							},
						};
					},
				},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Verify migrations were called in order
			expect(migrationCalls).toEqual([2, 3]);

			// Verify store is ready with migrated data
			if (store.state.status === 'ready') {
				expect((store.state.data.settings as any).migratedFrom).toBe(2);
			} else {
				expect.fail('Store should be ready');
			}

			// Verify migrated data was saved to storage
			const saved = storage.data.get(
				'test-0x1234567890123456789012345678901234567890',
			);
			expect(saved?.$version).toBe(3);
		});

		it('sets error when migration is missing', async () => {
			// Pre-populate storage with version 1 data
			storage.data.set('test-0x1234567890123456789012345678901234567890', {
				$version: 1,
				data: {
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				},
				$timestamps: {settings: 500},
				$itemTimestamps: {operations: {}},
				$tombstones: {operations: {}},
			});

			// Create store with schemaVersion 3 but only migration for v3 (missing v2)
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
				schemaVersion: 3, // Target version 3
				migrations: {
					// Missing migration for version 2!
					3: (oldData: unknown) => {
						const data = oldData as any;
						return {
							...data,
							$version: 3,
						};
					},
				},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 50));

			// Store should remain in loading state since migration failed
			expect(store.state.status).toBe('loading');

			// Error should be captured in status
			expect(store.status.storageError).toBeDefined();
			expect(store.status.storageError?.message).toBe(
				'Missing migration for version 2',
			);
		});

		it('does not run migrations when schema version matches', async () => {
			// Pre-populate storage with version 3 data (same as target)
			storage.data.set('test-0x1234567890123456789012345678901234567890', {
				$version: 3,
				data: {
					settings: {theme: 'existing', volume: 0.7},
					operations: {},
				},
				$timestamps: {settings: 500},
				$itemTimestamps: {operations: {}},
				$tombstones: {operations: {}},
			});

			const migrationCalls: number[] = [];

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
				schemaVersion: 3,
				migrations: {
					2: () => {
						migrationCalls.push(2);
						return {} as any;
					},
					3: () => {
						migrationCalls.push(3);
						return {} as any;
					},
				},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// No migrations should have been called
			expect(migrationCalls).toEqual([]);

			// Store should be ready with existing data
			if (store.state.status === 'ready') {
				expect(store.state.data.settings.theme).toBe('existing');
			} else {
				expect.fail('Store should be ready');
			}
		});

		it('uses default data for new accounts (no migration needed)', async () => {
			// No pre-existing data in storage
			const migrationCalls: number[] = [];

			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'default-theme', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
				schemaVersion: 3,
				migrations: {
					2: () => {
						migrationCalls.push(2);
						return {} as any;
					},
					3: () => {
						migrationCalls.push(3);
						return {} as any;
					},
				},
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// No migrations should have been called (new account uses default)
			expect(migrationCalls).toEqual([]);

			// Store should be ready with default data
			if (store.state.status === 'ready') {
				expect(store.state.data.settings.theme).toBe('default-theme');
			} else {
				expect.fail('Store should be ready');
			}
		});
	});

	describe('enhanced subscribe - state transitions only', () => {
		it('subscribe() triggers on state transitions (idle -> loading -> ready)', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			const states: AsyncState<DataOf<TestSchema>>[] = [];
			store.subscribe((state) => states.push(state));

			// Clear initial subscription
			states.length = 0;

			// Trigger state transitions
			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Should have loading -> ready transitions
			const statuses = states.map((s) => s.status);
			expect(statuses).toContain('loading');
			expect(statuses).toContain('ready');
		});

		it('subscribe() does NOT trigger on permanent field set()', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Track subscription calls after ready state
			let subscriptionCallCount = 0;
			store.subscribe(() => {
				subscriptionCallCount++;
			});

			// Reset count after initial subscription
			subscriptionCallCount = 0;

			// Make a change to permanent field
			store.set('settings', {theme: 'light', volume: 0.8});

			// Should NOT have triggered another subscription call
			expect(subscriptionCallCount).toBe(0);
		});

		it('subscribe() does NOT trigger on map add/update/remove', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Track subscription calls after ready state
			let subscriptionCallCount = 0;
			store.subscribe(() => {
				subscriptionCallCount++;
			});

			// Reset count after initial subscription
			subscriptionCallCount = 0;

			// Add item
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);
			expect(subscriptionCallCount).toBe(0);

			// Update item
			clock = 2000;
			store.update('operations', 'op-1', {tx: '0xabc', status: 'confirmed'});
			expect(subscriptionCallCount).toBe(0);

			// Remove item
			store.remove('operations', 'op-1');
			expect(subscriptionCallCount).toBe(0);
		});
	});

	describe('getFieldStore', () => {
		it('returns undefined when store is not ready (permanent field)', () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			// Store is idle - no account set
			let fieldValue: unknown;
			const fieldStore = store.getFieldStore('settings');
			fieldStore.subscribe((v) => (fieldValue = v));

			expect(fieldValue).toBeUndefined();
		});

		it('returns current value for permanent field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			let fieldValue: {theme: string; volume: number} | undefined;
			const fieldStore = store.getFieldStore('settings');
			fieldStore.subscribe((v) => (fieldValue = v));

			expect(fieldValue).toBeDefined();
			expect(fieldValue?.theme).toBe('dark');
			expect(fieldValue?.volume).toBe(0.5);
		});

		it('triggers on set() for permanent field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			let fieldValue: {theme: string; volume: number} | undefined;
			const fieldStore = store.getFieldStore('settings');
			fieldStore.subscribe((v) => (fieldValue = v));

			// Change the field
			store.set('settings', {theme: 'light', volume: 0.9});

			expect(fieldValue?.theme).toBe('light');
			expect(fieldValue?.volume).toBe(0.9);
		});

		it('triggers on patch() for permanent field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			let fieldValue: {theme: string; volume: number} | undefined;
			const fieldStore = store.getFieldStore('settings');
			fieldStore.subscribe((v) => (fieldValue = v));

			// Patch the field
			store.patch('settings', {volume: 0.9});

			expect(fieldValue?.theme).toBe('dark'); // unchanged
			expect(fieldValue?.volume).toBe(0.9); // patched
		});

		it('returns current value for map field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Add some items first
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			let fieldValue:
				| Record<string, {tx: string; status: string; deleteAt: number}>
				| undefined;
			const fieldStore = store.getFieldStore('operations');
			fieldStore.subscribe((v) => (fieldValue = v as any));

			expect(fieldValue).toBeDefined();
			expect(Object.keys(fieldValue || {}).length).toBe(1);
			expect(fieldValue?.['op-1']?.tx).toBe('0xabc');
		});

		it('triggers on add() for map field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			let fieldValue:
				| Record<string, {tx: string; status: string; deleteAt: number}>
				| undefined;
			const fieldStore = store.getFieldStore('operations');
			fieldStore.subscribe((v) => (fieldValue = v as any));

			// Initially empty
			expect(Object.keys(fieldValue || {}).length).toBe(0);

			// Add an item
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			// Should now have the item
			expect(Object.keys(fieldValue || {}).length).toBe(1);
			expect(fieldValue?.['op-1']?.tx).toBe('0xabc');
		});

		it('triggers on remove() for map field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Add item first
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			let fieldValue:
				| Record<string, {tx: string; status: string; deleteAt: number}>
				| undefined;
			const fieldStore = store.getFieldStore('operations');
			fieldStore.subscribe((v) => (fieldValue = v as any));

			// Has item
			expect(Object.keys(fieldValue || {}).length).toBe(1);

			// Remove it
			store.remove('operations', 'op-1');

			// Should be empty
			expect(Object.keys(fieldValue || {}).length).toBe(0);
		});

		it('does NOT trigger on update() for map field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Add item first
			store.add(
				'operations',
				'op-1',
				{tx: '0xabc', status: 'pending'},
				{deleteAt: 9999},
			);

			let subscribeCallCount = 0;
			const fieldStore = store.getFieldStore('operations');
			fieldStore.subscribe(() => {
				subscribeCallCount++;
			});

			// Reset count after initial subscription
			subscribeCallCount = 0;

			// Update item
			clock = 2000;
			store.update('operations', 'op-1', {tx: '0xabc', status: 'confirmed'});

			// Should NOT have triggered the field store
			expect(subscribeCallCount).toBe(0);
		});

		it('returns cached instance for same field', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			// Get field store twice
			const fieldStore1 = store.getFieldStore('settings');
			const fieldStore2 = store.getFieldStore('settings');

			// Should be the same instance
			expect(fieldStore1).toBe(fieldStore2);

			// Different field should return different instance
			const fieldStore3 = store.getFieldStore('operations');
			expect(fieldStore1).not.toBe(fieldStore3);
		});

		it('clears cache on account switch', async () => {
			const store = createSyncableStore({
				schema: testSchema,
				account: accountStore,
				storage,
				storageKey: (addr) => `test-${addr}`,
				defaultData: () => ({
					settings: {theme: 'dark', volume: 0.5},
					operations: {},
				}),
				clock: () => clock,
			});
			store.start();

			// First account
			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 20));

			const fieldStore1 = store.getFieldStore('settings');

			// Switch to different account
			accountStore.set('0x0000000000000000000000000000000000000001');
			await new Promise((r) => setTimeout(r, 20));

			const fieldStore2 = store.getFieldStore('settings');

			// Should be different instances after account switch
			expect(fieldStore1).not.toBe(fieldStore2);
		});
	});
});
