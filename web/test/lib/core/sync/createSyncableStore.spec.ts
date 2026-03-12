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

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			const events: AsyncState<DataOf<TestSchema>>[] = [];
			store.on('state', (state) => events.push(state));

			accountStore.set(undefined);
			await new Promise((r) => setTimeout(r, 10));

			expect(events[events.length - 1].status).toBe('idle');
		});

		it('emits state event when data is modified', async () => {
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

			accountStore.set('0x1234567890123456789012345678901234567890');
			await new Promise((r) => setTimeout(r, 10));

			const events: AsyncState<DataOf<TestSchema>>[] = [];
			store.on('state', (state) => events.push(state));

			store.set('settings', {theme: 'light', volume: 0.8});

			// Should emit state event with updated data
			expect(events.length).toBeGreaterThan(0);
			const lastEvent = events[events.length - 1];
			if (lastEvent.status === 'ready') {
				expect(lastEvent.data.settings.theme).toBe('light');
			} else {
				expect.fail('Expected ready state');
			}
		});
	});
});
