/**
 * Simple Syncable Store - Cleanup Algorithm
 *
 * Removes expired items and tombstones from the store.
 * Runs on store initialization and after every merge.
 */

import type { Schema, InternalStorage, DataOf } from './types';

/**
 * Clean up expired items and tombstones from storage.
 * Items and tombstones with deleteAt <= now are removed.
 *
 * @param storage - The internal storage to clean
 * @param schema - The schema definition
 * @param now - Current timestamp (default: Date.now())
 * @returns New storage object with expired items/tombstones removed
 */
export function cleanup<S extends Schema>(
	storage: InternalStorage<S>,
	schema: S,
	now: number = Date.now(),
): InternalStorage<S> {
	const result: InternalStorage<S> = {
		$version: storage.$version,
		data: { ...storage.data } as DataOf<S>,
		$timestamps: { ...storage.$timestamps },
		$itemTimestamps: {} as InternalStorage<S>['$itemTimestamps'],
		$tombstones: {} as InternalStorage<S>['$tombstones'],
	};

	for (const field of Object.keys(schema) as (keyof S & string)[]) {
		const fieldDef = schema[field];

		if (fieldDef.__type === 'map') {
			// Copy and filter tombstones
			const tombstones = (storage.$tombstones as Record<string, Record<string, number>>)[field] ?? {};
			const cleanedTombstones: Record<string, number> = {};

			for (const [key, deleteAt] of Object.entries(tombstones)) {
				if (deleteAt > now) {
					cleanedTombstones[key] = deleteAt;
				}
			}

			(result.$tombstones as Record<string, Record<string, number>>)[field] = cleanedTombstones;

			// Copy and filter items
			const items = ((storage.data as Record<string, unknown>)[field] ?? {}) as Record<string, { deleteAt: number }>;
			const timestamps = ((storage.$itemTimestamps as Record<string, Record<string, number>>)[field] ?? {});
			const cleanedItems: Record<string, unknown> = {};
			const cleanedTimestamps: Record<string, number> = {};

			for (const [key, item] of Object.entries(items)) {
				if (item.deleteAt > now) {
					cleanedItems[key] = item;
					if (timestamps[key] !== undefined) {
						cleanedTimestamps[key] = timestamps[key];
					}
				}
			}

			(result.data as Record<string, unknown>)[field] = cleanedItems;
			(result.$itemTimestamps as Record<string, Record<string, number>>)[field] = cleanedTimestamps;
		} else if (fieldDef.__type === 'permanent') {
			// Permanent fields are never cleaned up
			// They're already copied above
		}
	}

	return result;
}
