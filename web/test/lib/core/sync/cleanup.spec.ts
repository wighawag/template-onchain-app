import { describe, it, expect } from 'vitest';
import { cleanup } from '../../../../src/lib/core/sync/cleanup';
import { defineSchema, permanent, map } from '../../../../src/lib/core/sync/types';

describe('cleanup', () => {
	const testSchema = defineSchema({
		settings: permanent<{ theme: string }>(),
		operations: map<{ tx: string; status: string }>(),
	});

	it('removes expired items past their deleteAt', () => {
		const now = 5000;
		const storage = {
			$version: 1,
			data: {
				settings: { theme: 'dark' },
				operations: {
					'op-1': { tx: '0x1', status: 'done', deleteAt: 3000 }, // Expired
					'op-2': { tx: '0x2', status: 'pending', deleteAt: 7000 }, // Still valid
				},
			},
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: { 'op-1': 1000, 'op-2': 2000 } },
			$tombstones: { operations: {} },
		};

		const result = cleanup(storage, testSchema, now);

		expect(result.data.operations['op-1']).toBeUndefined();
		expect(result.data.operations['op-2']).toBeDefined();
		expect(result.$itemTimestamps.operations?.['op-1']).toBeUndefined();
		expect(result.$itemTimestamps.operations?.['op-2']).toBe(2000);
	});

	it('removes expired tombstones past their deleteAt', () => {
		const now = 5000;
		const storage = {
			$version: 1,
			data: {
				settings: { theme: 'dark' },
				operations: {},
			},
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: {} },
			$tombstones: {
				operations: {
					'old-item': 3000, // Expired tombstone
					'recent-item': 7000, // Still valid tombstone
				},
			},
		};

		const result = cleanup(storage, testSchema, now);

		expect(result.$tombstones.operations?.['old-item']).toBeUndefined();
		expect(result.$tombstones.operations?.['recent-item']).toBe(7000);
	});

	it('keeps valid items and tombstones', () => {
		const now = 2000;
		const storage = {
			$version: 1,
			data: {
				settings: { theme: 'light' },
				operations: {
					'op-1': { tx: '0x1', status: 'pending', deleteAt: 5000 },
				},
			},
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: { 'op-1': 1500 } },
			$tombstones: { operations: { 'deleted-1': 6000 } },
		};

		const result = cleanup(storage, testSchema, now);

		expect(result.data.operations['op-1']).toBeDefined();
		expect(result.$tombstones.operations?.['deleted-1']).toBe(6000);
	});

	it('does not modify permanent fields', () => {
		const now = 99999;
		const storage = {
			$version: 1,
			data: {
				settings: { theme: 'dark' },
				operations: {},
			},
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: {} },
			$tombstones: { operations: {} },
		};

		const result = cleanup(storage, testSchema, now);

		// Permanent fields are never cleaned up regardless of timestamp
		expect(result.data.settings).toStrictEqual({ theme: 'dark' });
		expect(result.$timestamps.settings).toBe(1000);
	});

	it('uses Date.now() when no time is provided', () => {
		const storage = {
			$version: 1,
			data: {
				settings: { theme: 'dark' },
				operations: {
					'old-op': { tx: '0x1', status: 'done', deleteAt: 1 }, // Definitely expired
				},
			},
			$timestamps: { settings: 1000 },
			$itemTimestamps: { operations: { 'old-op': 1 } },
			$tombstones: { operations: {} },
		};

		const result = cleanup(storage, testSchema);

		// Item with deleteAt: 1 should be expired (it's in the past)
		expect(result.data.operations['old-op']).toBeUndefined();
	});
});
