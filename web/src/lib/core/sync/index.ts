/**
 * Simple Syncable Store - Public API
 *
 * A simplified, type-safe syncable store with two field types only,
 * automatic timestamp management, and first-class server sync support.
 */

// Schema definition
export {
	defineSchema,
	permanent,
	map,
	type PermanentField,
	type MapField,
	type Schema,
	type DataOf,
	type PermanentKeys,
	type MapKeys,
	type ExtractPermanent,
	type ExtractMapItem,
	type DeepPartial,
	type InternalStorage,
	type AsyncState,
	type StoreStatus,
	type SyncEvent,
	type StoreChange,
	type StoreEvents,
	type SyncAdapter,
	type SyncConfig,
} from './types';

// Store creation
export {
	createSyncableStore,
	type SyncableStore,
	type SyncableStoreConfig,
	type AccountStore,
} from './createSyncableStore';

// Merge functions (for advanced use cases)
export {
	tiebreaker,
	mergePermanent,
	mergeMap,
	mergeStore,
	type PermanentMergeInput,
	type PermanentMergeResult,
	type MapState,
	type MapChange,
	type MapMergeResult,
	type StoreMergeResult,
} from './merge';

// Cleanup function
export { cleanup } from './cleanup';
