/**
 * Simple Syncable Store - Merge Algorithm
 *
 * Provides deterministic merge functions for permanent and map fields.
 * Uses "higher timestamp wins" with deterministic tiebreaker for conflicts.
 */

import stableStringify from 'json-stable-stringify';

// ============================================================================
// Merge Outcome Types
// ============================================================================

/**
 * Clear discriminated union for merge outcomes.
 * - 'incoming': Incoming value won (emit change, no push)
 * - 'current': Current value won with different data (need push)
 * - 'tie': Values semantically equal (no action needed)
 */
export type MergeOutcome = 'incoming' | 'current' | 'tie';

/**
 * Tiebreaker-specific outcome (first/second args, or tie).
 */
export type TiebreakerOutcome = 'first' | 'second' | 'tie';

/**
 * Result of tiebreaker function with clear outcome indication.
 */
export interface TiebreakerResult<T> {
	value: T;
	outcome: TiebreakerOutcome;
}

// ============================================================================
// Tiebreaker
// ============================================================================

/**
 * Deterministic tiebreaker for values with identical timestamps.
 * Returns the lexicographically smaller value when serialized,
 * with explicit outcome indicating which argument won or if they're equal.
 *
 * CRITICAL: Uses json-stable-stringify (NOT JSON.stringify) to ensure
 * deterministic property order across all JavaScript engines.
 */
export function tiebreaker<T>(a: T, b: T): TiebreakerResult<T> {
	const aStr = stableStringify(a) ?? '';
	const bStr = stableStringify(b) ?? '';

	if (aStr === bStr) {
		// Semantically equal - true tie
		return { value: a, outcome: 'tie' };
	}

	// Different values - pick lexicographically smaller
	if (aStr < bStr) {
		return { value: a, outcome: 'first' };
	}
	return { value: b, outcome: 'second' };
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
	/** Clear indication of who won - mutually exclusive states */
	outcome: MergeOutcome;
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
			outcome: 'incoming',
		};
	}

	if (current.timestamp > incoming.timestamp) {
		return {
			value: current.value,
			timestamp: current.timestamp,
			outcome: 'current',
		};
	}

	// Same timestamp - use deterministic tiebreaker
	const result = tiebreaker(current.value, incoming.value);

	// Map tiebreaker outcome to merge outcome
	let outcome: MergeOutcome;
	if (result.outcome === 'tie') {
		outcome = 'tie';
	} else if (result.outcome === 'second') {
		outcome = 'incoming'; // Second arg (incoming) won
	} else {
		outcome = 'current'; // First arg (current) won
	}

	return {
		value: result.value,
		timestamp: current.timestamp,
		outcome,
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
	/** Count of items where local had genuinely different/newer data */
	localWonCount: number;
	/** Count of items where timestamps matched AND values were semantically equal */
	tieCount: number;
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
	let localWonCount = 0;
	let tieCount = 0;

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
			// Only in current - LOCAL WINS (server doesn't have this item)
			winner = cItem;
			winnerTs = cTs;
			localWonCount++;
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
				// Current has higher timestamp - LOCAL WINS
				winner = cItem;
				winnerTs = cTs;
				localWonCount++;
			} else {
				// Same timestamp - deterministic tiebreaker
				const picked = tiebreaker(
					{item: cItem, ts: cTs},
					{item: iItem, ts: iTs},
				);
				winner = picked.value.item;
				winnerTs = picked.value.ts;

				// Use outcome discriminated union
				switch (picked.outcome) {
					case 'tie':
						tieCount++; // Values equal, no push needed
						break;
					case 'first':
						localWonCount++; // Current won with different data
						break;
					case 'second':
						// Incoming won tiebreaker
						changes.push({
							event: `${fieldName}:updated`,
							data: {key, item: iItem},
						});
						break;
				}
			}
		}

		items[key] = winner;
		timestamps[key] = winnerTs;
	}

	return {items, timestamps, tombstones, changes, localWonCount, tieCount};
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
	/** True if local has changes that need to be pushed to server */
	hasLocalChanges: boolean;
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
	let hasLocalChanges = false;

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

			// Use outcome discriminated union
			switch (mergeResult.outcome) {
				case 'incoming':
					changes.push({event: `${field}:changed`, data: mergeResult.value});
					break;
				case 'current':
					if (currentTs > 0) {
						// Local has changes that need pushing
						hasLocalChanges = true;
					}
					break;
				case 'tie':
					// Values were semantically equal - no action needed
					break;
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

			// Track if local won any items in this map
			// tieCount doesn't contribute to hasLocalChanges - ties mean equal values
			if (mapResult.localWonCount > 0) {
				hasLocalChanges = true;
			}
		}
	}

	return {merged: result, changes, hasLocalChanges};
}

// ============================================================================
// Merge and Cleanup Combined
// ============================================================================

import {cleanup, type CleanupResult} from './cleanup';

/**
 * Result of merge + cleanup operation.
 */
export interface MergeAndCleanupResult<S extends Schema> {
	/** Final storage after merge and cleanup */
	storage: InternalStorage<S>;

	/** All changes from both merge AND cleanup combined */
	changes: StoreChange[];

	/** True if cleanup deleted any tombstones */
	tombstonesDeleted: boolean;

	/** True if cleanup deleted any expired items */
	itemsExpired: boolean;

	/** True if server should receive a push (local had winning data) */
	serverNeedsUpdate: boolean;
}

/**
 * Merge two stores and then run cleanup.
 * Returns combined changes from both operations.
 *
 * Handles deduplication: if an item is added in merge but immediately expires
 * in cleanup, we emit only the final state (removed), not both added then removed.
 */
export function mergeAndCleanup<S extends Schema>(
	current: InternalStorage<S>,
	incoming: InternalStorage<S>,
	schema: S,
	now: number = Date.now(),
): MergeAndCleanupResult<S> {
	// Step 1: Merge
	const {merged, changes: mergeChanges, hasLocalChanges} = mergeStore(current, incoming, schema);

	// Step 2: Cleanup
	const {
		storage: cleaned,
		changes: cleanupChanges,
		tombstonesDeleted,
	} = cleanup(merged, schema, now);

	// Step 3: Deduplicate changes
	// An item that was :added/:updated in merge but :removed in cleanup
	// should only emit :removed (or nothing if it was :added then :removed)
	const allChanges = deduplicateChanges(mergeChanges, cleanupChanges);

	// Step 4: Determine if server needs an update
	// Server needs update when local had winning data.
	// Note: Cleanup (tombstonesDeleted, itemsExpired) does NOT trigger a push.
	// Cleanup happens independently on each client, so server data will
	// eventually be cleaned when a client pushes for other reasons.
	const serverNeedsUpdate = hasLocalChanges;

	return {
		storage: cleaned,
		changes: allChanges,
		tombstonesDeleted,
		itemsExpired: cleanupChanges.length > 0,
		serverNeedsUpdate,
	};
}

/**
 * Deduplicate merge and cleanup changes.
 *
 * Edge cases:
 * - :added then :removed -> no event (item was added then immediately expired)
 * - :updated then :removed -> :removed only (final state is removed)
 * - :removed (merge) -> :removed (tombstone-based removal from merge, keep it)
 * - :removed (cleanup only) -> :removed (item existed before, now expired)
 */
function deduplicateChanges(
	mergeChanges: StoreChange[],
	cleanupChanges: StoreChange[],
): StoreChange[] {
	const result: StoreChange[] = [];

	// Build set of keys that were expired during cleanup
	const expiredKeys = new Set<string>();
	for (const change of cleanupChanges) {
		if (change.event.endsWith(':removed')) {
			const data = change.data as {key: string};
			const fieldName = change.event.split(':')[0];
			expiredKeys.add(`${fieldName}:${data.key}`);
		}
	}

	// Build set of keys that were added during merge (to filter out add+remove pairs)
	const addedKeys = new Set<string>();
	for (const change of mergeChanges) {
		if (change.event.endsWith(':added')) {
			const data = change.data as {key: string};
			const fieldName = change.event.split(':')[0];
			addedKeys.add(`${fieldName}:${data.key}`);
		}
	}

	// Filter merge changes
	for (const change of mergeChanges) {
		const fieldName = change.event.split(':')[0];

		if (change.event.endsWith(':added') || change.event.endsWith(':updated')) {
			const data = change.data as {key: string};
			const keyPath = `${fieldName}:${data.key}`;

			if (expiredKeys.has(keyPath)) {
				// Item was added/updated but then expired - skip this change
				continue;
			}
		}

		result.push(change);
	}

	// Filter cleanup changes - skip :removed for items that were just :added
	// (add+remove = no net change, item was never visible)
	for (const change of cleanupChanges) {
		if (change.event.endsWith(':removed')) {
			const data = change.data as {key: string};
			const fieldName = change.event.split(':')[0];
			const keyPath = `${fieldName}:${data.key}`;

			if (addedKeys.has(keyPath)) {
				// Item was added then removed - no net change, skip
				continue;
			}
		}

		result.push(change);
	}

	return result;
}
