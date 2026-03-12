/**
 * Simple Syncable Store - Merge Algorithm
 *
 * Provides deterministic merge functions for permanent and map fields.
 * Uses "higher timestamp wins" with deterministic tiebreaker for conflicts.
 */

import stableStringify from 'json-stable-stringify';

// ============================================================================
// Tiebreaker
// ============================================================================

/**
 * Deterministic tiebreaker for values with identical timestamps.
 * Returns the lexicographically smaller value when serialized.
 *
 * CRITICAL: Uses json-stable-stringify (NOT JSON.stringify) to ensure
 * deterministic property order across all JavaScript engines.
 */
export function tiebreaker<T>(a: T, b: T): T {
	const aStr = stableStringify(a) ?? '';
	const bStr = stableStringify(b) ?? '';
	return aStr <= bStr ? a : b;
}

// ============================================================================
// Permanent Field Merge
// ============================================================================

/**
 * Input for permanent field merge.
 */
export interface PermanentMergeInput<T> {
	value: T;
	timestamp: number;
}

/**
 * Result of permanent field merge.
 */
export interface PermanentMergeResult<T> {
	value: T;
	timestamp: number;
	/** True if incoming value was picked */
	incomingWon: boolean;
}

/**
 * Merge two permanent field values.
 * Higher timestamp wins. On tie, lexicographically smaller value wins.
 */
export function mergePermanent<T>(
	current: PermanentMergeInput<T>,
	incoming: PermanentMergeInput<T>,
): PermanentMergeResult<T> {
	// Higher timestamp wins
	if (incoming.timestamp > current.timestamp) {
		return {
			value: incoming.value,
			timestamp: incoming.timestamp,
			incomingWon: true,
		};
	}

	if (current.timestamp > incoming.timestamp) {
		return {
			value: current.value,
			timestamp: current.timestamp,
			incomingWon: false,
		};
	}

	// Same timestamp - use deterministic tiebreaker
	const winner = tiebreaker(current.value, incoming.value);
	const incomingWon = winner === incoming.value;

	return {
		value: winner,
		timestamp: current.timestamp,
		incomingWon,
	};
}

// ============================================================================
// Map Field Merge
// ============================================================================

/**
 * Map state for merge input.
 */
export interface MapState<T> {
	items: Record<string, T>;
	timestamps: Record<string, number>;
	tombstones: Record<string, number>; // key -> deleteAt time
}

/**
 * Change event emitted during merge.
 */
export interface MapChange<T> {
	event: `${string}:added` | `${string}:updated` | `${string}:removed`;
	data: {key: string; item: T};
}

/**
 * Result of map merge.
 */
export interface MapMergeResult<T> {
	items: Record<string, T>;
	timestamps: Record<string, number>;
	tombstones: Record<string, number>;
	changes: MapChange<T>[];
}

/**
 * Merge two map field states.
 * Items are merged by key using timestamps.
 * Tombstones indicate deleted items.
 */
export function mergeMap<T>(
	current: MapState<T>,
	incoming: MapState<T>,
	fieldName: string,
): MapMergeResult<T> {
	const items: Record<string, T> = {};
	const timestamps: Record<string, number> = {};
	const tombstones: Record<string, number> = {};
	const changes: MapChange<T>[] = [];

	// Merge tombstones first - later deleteAt wins
	const allTombstoneKeys = new Set([
		...Object.keys(current.tombstones),
		...Object.keys(incoming.tombstones),
	]);

	for (const key of allTombstoneKeys) {
		const ct = current.tombstones[key] ?? 0;
		const it = incoming.tombstones[key] ?? 0;
		if (ct > 0 || it > 0) {
			tombstones[key] = Math.max(ct, it);
		}
	}

	// Merge items - skip tombstoned ones
	const allItemKeys = new Set([
		...Object.keys(current.items),
		...Object.keys(incoming.items),
	]);

	for (const key of allItemKeys) {
		const hadItem = key in current.items;
		const isTombstoned = key in tombstones;

		if (isTombstoned) {
			// Item was deleted - emit removed if we had it
			if (hadItem) {
				changes.push({
					event: `${fieldName}:removed`,
					data: {key, item: current.items[key]},
				});
			}
			continue;
		}

		const cItem = current.items[key];
		const iItem = incoming.items[key];
		const cTs = current.timestamps[key] ?? 0;
		const iTs = incoming.timestamps[key] ?? 0;

		let winner: T;
		let winnerTs: number;

		if (!cItem && iItem) {
			// New item from incoming
			winner = iItem;
			winnerTs = iTs;
			changes.push({
				event: `${fieldName}:added`,
				data: {key, item: iItem},
			});
		} else if (cItem && !iItem) {
			// Only in current - keep it
			winner = cItem;
			winnerTs = cTs;
			// No change - we keep current
		} else {
			// Both have item - higher timestamp wins
			if (iTs > cTs) {
				// Incoming has higher timestamp - it wins, emit update
				winner = iItem;
				winnerTs = iTs;
				changes.push({
					event: `${fieldName}:updated`,
					data: {key, item: iItem},
				});
			} else if (cTs > iTs) {
				// Current has higher timestamp - no change
				winner = cItem;
				winnerTs = cTs;
			} else {
				// Same timestamp - deterministic tiebreaker
				const picked = tiebreaker(
					{item: cItem, ts: cTs},
					{item: iItem, ts: iTs},
				);
				winner = picked.item;
				winnerTs = picked.ts;
				// Emit update if incoming won the tiebreaker
				if (winner === iItem) {
					changes.push({
						event: `${fieldName}:updated`,
						data: {key, item: iItem},
					});
				}
			}
		}

		items[key] = winner;
		timestamps[key] = winnerTs;
	}

	return {items, timestamps, tombstones, changes};
}

// ============================================================================
// Full Store Merge
// ============================================================================

import type {
	Schema,
	InternalStorage,
	StoreChange,
	DataOf,
	PermanentKeys,
	MapKeys,
} from './types';

/**
 * Result of full store merge.
 */
export interface StoreMergeResult<S extends Schema> {
	merged: InternalStorage<S>;
	changes: StoreChange[];
}

/**
 * Merge two complete store states.
 * Combines permanent and map field merges.
 */
export function mergeStore<S extends Schema>(
	current: InternalStorage<S>,
	incoming: InternalStorage<S>,
	schema: S,
): StoreMergeResult<S> {
	const result: InternalStorage<S> = {
		$version: Math.max(current.$version ?? 0, incoming.$version ?? 0),
		data: {} as DataOf<S>,
		$timestamps: {} as InternalStorage<S>['$timestamps'],
		$itemTimestamps: {} as InternalStorage<S>['$itemTimestamps'],
		$tombstones: {} as InternalStorage<S>['$tombstones'],
	};
	const changes: StoreChange[] = [];

	for (const field of Object.keys(schema) as (keyof S & string)[]) {
		const fieldDef = schema[field];

		if (fieldDef.__type === 'permanent') {
			// Merge permanent field
			const currentTs =
				(current.$timestamps as Record<string, number>)[field] ?? 0;
			const incomingTs =
				(incoming.$timestamps as Record<string, number>)[field] ?? 0;
			const currentValue = (current.data as Record<string, unknown>)[field];
			const incomingValue = (incoming.data as Record<string, unknown>)[field];

			const mergeResult = mergePermanent(
				{value: currentValue, timestamp: currentTs},
				{value: incomingValue, timestamp: incomingTs},
			);

			(result.data as Record<string, unknown>)[field] = mergeResult.value;
			(result.$timestamps as Record<string, number>)[field] =
				mergeResult.timestamp;

			// Track change if incoming won
			if (mergeResult.incomingWon) {
				changes.push({event: `${field}:changed`, data: mergeResult.value});
			}
		} else if (fieldDef.__type === 'map') {
			// Merge map field
			const currentItems = ((current.data as Record<string, unknown>)[field] ??
				{}) as Record<string, unknown>;
			const incomingItems = ((incoming.data as Record<string, unknown>)[
				field
			] ?? {}) as Record<string, unknown>;
			const currentTimestamps =
				(current.$itemTimestamps as Record<string, Record<string, number>>)[
					field
				] ?? {};
			const incomingTimestamps =
				(incoming.$itemTimestamps as Record<string, Record<string, number>>)[
					field
				] ?? {};
			const currentTombstones =
				(current.$tombstones as Record<string, Record<string, number>>)[
					field
				] ?? {};
			const incomingTombstones =
				(incoming.$tombstones as Record<string, Record<string, number>>)[
					field
				] ?? {};

			const mapResult = mergeMap(
				{
					items: currentItems,
					timestamps: currentTimestamps,
					tombstones: currentTombstones,
				},
				{
					items: incomingItems,
					timestamps: incomingTimestamps,
					tombstones: incomingTombstones,
				},
				field,
			);

			(result.data as Record<string, unknown>)[field] = mapResult.items;
			(result.$itemTimestamps as Record<string, Record<string, number>>)[
				field
			] = mapResult.timestamps;
			(result.$tombstones as Record<string, Record<string, number>>)[field] =
				mapResult.tombstones;

			// Add map changes
			changes.push(...(mapResult.changes as StoreChange[]));
		}
	}

	return {merged: result, changes};
}
