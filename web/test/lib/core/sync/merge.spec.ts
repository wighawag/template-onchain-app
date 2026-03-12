import { describe, it, expect } from 'vitest';
import { tiebreaker, mergePermanent, mergeMap, mergeStore } from '../../../../src/lib/core/sync/merge';
import { defineSchema, permanent, map } from '../../../../src/lib/core/sync/types';

describe('tiebreaker', () => {
	it('returns lexicographically smaller value when comparing simple objects', () => {
		const a = { name: 'alice' };
		const b = { name: 'bob' };
		
		// 'alice' < 'bob' lexicographically, so a should win
		expect(tiebreaker(a, b)).toBe(a);
		expect(tiebreaker(b, a)).toBe(a);
	});

	it('is deterministic regardless of property insertion order', () => {
		// Create objects with same content but different property order
		const a = { z: 1, a: 2 };
		const b: Record<string, number> = {};
		b.a = 2;
		b.z = 1;
		
		// Both serialize to the same string, so either is valid
		// The important thing is it doesn't throw or behave inconsistently
		const result1 = tiebreaker(a, b);
		const result2 = tiebreaker(b, a);
		
		// Both calls should return content-equivalent objects
		expect(result1).toStrictEqual({ z: 1, a: 2 });
		expect(result2).toStrictEqual({ z: 1, a: 2 });
	});

	it('handles nested objects deterministically', () => {
		const a = { outer: { inner: 'value1' } };
		const b = { outer: { inner: 'value2' } };
		
		// 'value1' < 'value2', so a wins
		expect(tiebreaker(a, b)).toBe(a);
		expect(tiebreaker(b, a)).toBe(a);
	});
});

describe('mergePermanent', () => {
	it('returns incoming value when incoming timestamp is higher', () => {
		const current = { value: { name: 'old' }, timestamp: 1000 };
		const incoming = { value: { name: 'new' }, timestamp: 2000 };
		
		const result = mergePermanent(current, incoming);
		
		expect(result.value).toBe(incoming.value);
		expect(result.timestamp).toBe(2000);
		expect(result.incomingWon).toBe(true);
	});

	it('returns current value when current timestamp is higher', () => {
		const current = { value: { name: 'current' }, timestamp: 3000 };
		const incoming = { value: { name: 'incoming' }, timestamp: 2000 };
		
		const result = mergePermanent(current, incoming);
		
		expect(result.value).toBe(current.value);
		expect(result.timestamp).toBe(3000);
		expect(result.incomingWon).toBe(false);
	});

	it('uses tiebreaker when timestamps are equal', () => {
		const current = { value: { name: 'bob' }, timestamp: 1000 };
		const incoming = { value: { name: 'alice' }, timestamp: 1000 };
		
		const result = mergePermanent(current, incoming);
		
		// 'alice' < 'bob' lexicographically, so incoming wins
		expect(result.value).toStrictEqual({ name: 'alice' });
		expect(result.timestamp).toBe(1000);
		expect(result.incomingWon).toBe(true);
	});

	it('returns current when timestamps equal and current wins tiebreaker', () => {
		const current = { value: { name: 'alice' }, timestamp: 1000 };
		const incoming = { value: { name: 'bob' }, timestamp: 1000 };
		
		const result = mergePermanent(current, incoming);
		
		// 'alice' < 'bob' lexicographically, so current wins
		expect(result.value).toStrictEqual({ name: 'alice' });
		expect(result.timestamp).toBe(1000);
		expect(result.incomingWon).toBe(false);
	});
});

describe('mergeMap', () => {
	it('adds new item from incoming and emits added event', () => {
		const current = {
			items: {},
			timestamps: {},
			tombstones: {},
		};
		const incoming = {
			items: { 'item-1': { value: 'hello', deleteAt: 9999 } },
			timestamps: { 'item-1': 1000 },
			tombstones: {},
		};
		
		const result = mergeMap(current, incoming, 'operations');
		
		expect(result.items).toStrictEqual({ 'item-1': { value: 'hello', deleteAt: 9999 } });
		expect(result.timestamps).toStrictEqual({ 'item-1': 1000 });
		expect(result.tombstones).toStrictEqual({});
		expect(result.changes).toHaveLength(1);
		expect(result.changes[0]).toStrictEqual({
			event: 'operations:added',
			data: { key: 'item-1', item: { value: 'hello', deleteAt: 9999 } },
		});
	});

	it('keeps current item when incoming is missing', () => {
		const current = {
			items: { 'item-1': { value: 'current', deleteAt: 9999 } },
			timestamps: { 'item-1': 1000 },
			tombstones: {},
		};
		const incoming = {
			items: {},
			timestamps: {},
			tombstones: {},
		};
		
		const result = mergeMap(current, incoming, 'operations');
		
		expect(result.items).toStrictEqual({ 'item-1': { value: 'current', deleteAt: 9999 } });
		expect(result.changes).toHaveLength(0);
	});

	it('updates item when incoming has higher timestamp', () => {
		const current = {
			items: { 'item-1': { value: 'old', deleteAt: 9999 } },
			timestamps: { 'item-1': 1000 },
			tombstones: {},
		};
		const incoming = {
			items: { 'item-1': { value: 'new', deleteAt: 9999 } },
			timestamps: { 'item-1': 2000 },
			tombstones: {},
		};
		
		const result = mergeMap(current, incoming, 'operations');
		
		expect(result.items['item-1'].value).toBe('new');
		expect(result.timestamps['item-1']).toBe(2000);
		expect(result.changes).toHaveLength(1);
		expect(result.changes[0].event).toBe('operations:updated');
	});

	it('keeps current item when current has higher timestamp', () => {
		const current = {
			items: { 'item-1': { value: 'current', deleteAt: 9999 } },
			timestamps: { 'item-1': 3000 },
			tombstones: {},
		};
		const incoming = {
			items: { 'item-1': { value: 'incoming', deleteAt: 9999 } },
			timestamps: { 'item-1': 2000 },
			tombstones: {},
		};
		
		const result = mergeMap(current, incoming, 'operations');
		
		expect(result.items['item-1'].value).toBe('current');
		expect(result.timestamps['item-1']).toBe(3000);
		expect(result.changes).toHaveLength(0);
	});

	it('removes item when tombstone exists', () => {
		const current = {
			items: { 'item-1': { value: 'alive', deleteAt: 9999 } },
			timestamps: { 'item-1': 1000 },
			tombstones: {},
		};
		const incoming = {
			items: {},
			timestamps: {},
			tombstones: { 'item-1': 9999 }, // tombstone with deleteAt time
		};
		
		const result = mergeMap(current, incoming, 'operations');
		
		expect(result.items['item-1']).toBeUndefined();
		expect(result.tombstones['item-1']).toBe(9999);
		expect(result.changes).toHaveLength(1);
		expect(result.changes[0].event).toBe('operations:removed');
	});

	it('merges tombstones taking later deleteAt', () => {
		const current = {
			items: {},
			timestamps: {},
			tombstones: { 'item-1': 5000 },
		};
		const incoming = {
			items: {},
			timestamps: {},
			tombstones: { 'item-1': 8000 },
		};
		
		const result = mergeMap(current, incoming, 'operations');
		
		expect(result.tombstones['item-1']).toBe(8000);
	});
});

describe('mergeStore', () => {
	// Define a test schema
	const testSchema = defineSchema({
		settings: permanent<{ theme: string; volume: number }>(),
		operations: map<{ tx: string; status: string }>(),
	});

	it('merges permanent and map fields together', () => {
		const current = {
			$version: 1,
			data: {
				settings: { theme: 'dark', volume: 0.5 },
				operations: {},
			},
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: {} },
			$tombstones: { operations: {} },
		};
		
		const incoming = {
			$version: 1,
			data: {
				settings: { theme: 'light', volume: 0.8 },
				operations: {
					'op-1': { tx: '0xabc', status: 'pending', deleteAt: 9999 },
				},
			},
			$timestamps: { settings: 2000 },
			$itemTimestamps: { operations: { 'op-1': 1500 } },
			$tombstones: { operations: {} },
		};
		
		const result = mergeStore(current, incoming, testSchema);
		
		// Settings should update (incoming has higher timestamp)
		expect(result.merged.data.settings.theme).toBe('light');
		expect(result.merged.data.settings.volume).toBe(0.8);
		expect(result.merged.$timestamps.settings).toBe(2000);
		
		// Operations should include new item
		expect(result.merged.data.operations['op-1']).toBeDefined();
		expect(result.merged.data.operations['op-1'].tx).toBe('0xabc');
		
		// Changes should include both permanent and map changes
		expect(result.changes.length).toBe(2);
		expect(result.changes.some(c => c.event === 'settings:changed')).toBe(true);
		expect(result.changes.some(c => c.event === 'operations:added')).toBe(true);
	});

	it('preserves higher version number', () => {
		const current = {
			$version: 2,
			data: { settings: { theme: 'dark', volume: 0.5 }, operations: {} },
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: {} },
			$tombstones: { operations: {} },
		};
		
		const incoming = {
			$version: 1,
			data: { settings: { theme: 'light', volume: 0.5 }, operations: {} },
			$timestamps: { settings: 500 },
			$itemTimestamps: { operations: {} },
			$tombstones: { operations: {} },
		};
		
		const result = mergeStore(current, incoming, testSchema);
		
		expect(result.merged.$version).toBe(2);
	});

	it('returns empty changes when nothing changed', () => {
		const current = {
			$version: 1,
			data: {
				settings: { theme: 'dark', volume: 0.5 },
				operations: {
					'op-1': { tx: '0xabc', status: 'pending', deleteAt: 9999 },
				},
			},
			$timestamps: { settings: 2000 },
			$itemTimestamps: { operations: { 'op-1': 1500 } },
			$tombstones: { operations: {} },
		};
		
		// Incoming has lower timestamps - nothing should change
		const incoming = {
			$version: 1,
			data: {
				settings: { theme: 'light', volume: 0.8 },
				operations: {
					'op-1': { tx: '0xold', status: 'old', deleteAt: 9999 },
				},
			},
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: { 'op-1': 1000 } },
			$tombstones: { operations: {} },
		};
		
		const result = mergeStore(current, incoming, testSchema);
		
		expect(result.changes).toHaveLength(0);
		expect(result.merged.data.settings.theme).toBe('dark');
		expect(result.merged.data.operations['op-1'].tx).toBe('0xabc');
	});
});
