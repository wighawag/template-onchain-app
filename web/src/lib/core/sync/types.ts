/**
 * Simple Syncable Store - Type Definitions
 *
 * Two field types only:
 * - Permanent: Single value, updated as whole, never deleted
 * - Map: Key-value collection with per-item timestamps and deleteAt
 */

// ============================================================================
// Field Type Markers
// ============================================================================

/**
 * Marker type for permanent fields - updated as a whole unit.
 */
export type PermanentField<T> = { __type: 'permanent'; __value?: T };

/**
 * Marker type for map fields - items merged individually.
 */
export type MapField<T> = { __type: 'map'; __item?: T };

// ============================================================================
// Schema Definition Helpers
// ============================================================================

/**
 * Define a permanent field in the schema.
 * Permanent fields are updated as a whole and never deleted.
 */
export function permanent<T>(): PermanentField<T> {
	return { __type: 'permanent' } as PermanentField<T>;
}

/**
 * Define a map field in the schema.
 * Map fields contain items that are individually tracked with timestamps and deleteAt.
 */
export function map<T>(): MapField<T> {
	return { __type: 'map' } as MapField<T>;
}

/**
 * Schema type - maps field names to field types.
 */
export type Schema = Record<string, PermanentField<unknown> | MapField<unknown>>;

/**
 * Define a schema with type inference.
 */
export function defineSchema<S extends Schema>(schema: S): S {
	return schema;
}

// ============================================================================
// Type Extractors
// ============================================================================

/**
 * Extract permanent field keys from a schema.
 */
export type PermanentKeys<S extends Schema> = {
	[K in keyof S]: S[K] extends PermanentField<unknown> ? K : never;
}[keyof S];

/**
 * Extract map field keys from a schema.
 */
export type MapKeys<S extends Schema> = {
	[K in keyof S]: S[K] extends MapField<unknown> ? K : never;
}[keyof S];

/**
 * Extract the inner type from a PermanentField.
 */
export type ExtractPermanent<F> = F extends PermanentField<infer T> ? T : never;

/**
 * Extract the item type from a MapField.
 */
export type ExtractMapItem<F> = F extends MapField<infer T> ? T : never;

/**
 * Extract the user-facing data type from schema.
 * Map items include deleteAt in the data.
 */
export type DataOf<S extends Schema> = {
	[K in keyof S]: S[K] extends PermanentField<infer T>
		? T
		: S[K] extends MapField<infer T>
			? Record<string, T & { deleteAt: number }>
			: never;
};

/**
 * Deep partial type for patch operations.
 */
export type DeepPartial<T> = T extends object
	? { [K in keyof T]?: DeepPartial<T[K]> }
	: T;

// ============================================================================
// Internal Storage Shape
// ============================================================================

/**
 * Internal storage structure with timestamps stored separately from user data.
 */
export type InternalStorage<S extends Schema> = {
	/** Schema version for migration tracking */
	$version: number;

	/** User's clean data */
	data: DataOf<S>;

	/** Timestamps for permanent fields */
	$timestamps: {
		[K in PermanentKeys<S>]?: number;
	};

	/** Per-item timestamps for map fields */
	$itemTimestamps: {
		[K in MapKeys<S>]?: Record<string, number>;
	};

	/** Tombstones for deleted map items (stores deleteAt time) */
	$tombstones: {
		[K in MapKeys<S>]?: Record<string, number>;
	};
};

// ============================================================================
// Store Status Types
// ============================================================================

/**
 * Unified status for sync and storage operations.
 */
export interface StoreStatus {
	// === Sync State ===

	/** Current sync state with server */
	readonly syncState: 'idle' | 'syncing' | 'error' | 'offline';

	/** Number of changes pending sync to server */
	readonly pendingCount: number;

	/** Last successful sync timestamp */
	readonly lastSyncedAt: number | null;

	/** Last sync error, if any */
	readonly syncError: Error | null;

	// === Storage State ===

	/** Current local storage state */
	readonly storageState: 'idle' | 'saving' | 'error';

	/** Last successful save timestamp */
	readonly lastSavedAt: number | null;

	/** Last storage error (e.g., QuotaExceededError) */
	readonly storageError: Error | null;

	/** Number of pending saves in queue */
	readonly pendingSaves: number;

	// === Convenience Getters ===

	/** True if any error (sync or storage) */
	readonly hasError: boolean;

	/** True if there are unsaved local changes */
	readonly hasUnsavedChanges: boolean;

	/** True if currently syncing or saving */
	readonly isBusy: boolean;
}

/**
 * Sync events for detailed tracking.
 */
export type SyncEvent =
	| { type: 'started' }
	| { type: 'completed'; timestamp: number }
	| { type: 'failed'; error: Error }
	| { type: 'offline' }
	| { type: 'online' };

// ============================================================================
// Type-Safe Event Map
// ============================================================================

/**
 * Generate event types from schema.
 * For a schema with `settings: permanent<T>()` and `operations: map<U>()`:
 *
 * {
 *   state: AsyncState<DataOf<S>>;
 *   'settings:changed': T;
 *   'operations:added': { key: string; item: U & { deleteAt: number } };
 *   'operations:updated': { key: string; item: U & { deleteAt: number } };
 *   'operations:removed': { key: string; item: U & { deleteAt: number } };
 *   sync: SyncEvent;
 * }
 */
export type StoreEvents<S extends Schema> = {
	state: AsyncState<DataOf<S>>;
	sync: SyncEvent;
} & PermanentEvents<S> &
	MapEvents<S>;

/**
 * Helper type - events for permanent fields.
 * Each permanent field K generates a `K:changed` event with the field's value type.
 */
type PermanentEvents<S extends Schema> = {
	[K in PermanentKeys<S> as `${K & string}:changed`]: ExtractPermanent<S[K]>;
};

/**
 * Helper type - events for map fields.
 * Each map field K generates `K:added`, `K:updated`, and `K:removed` events.
 */
type MapEvents<S extends Schema> = {
	[K in MapKeys<S> as `${K & string}:added`]: {
		key: string;
		item: ExtractMapItem<S[K]> & { deleteAt: number };
	};
} & {
	[K in MapKeys<S> as `${K & string}:updated`]: {
		key: string;
		item: ExtractMapItem<S[K]> & { deleteAt: number };
	};
} & {
	[K in MapKeys<S> as `${K & string}:removed`]: {
		key: string;
		item: ExtractMapItem<S[K]> & { deleteAt: number };
	};
};

// ============================================================================
// Async State Types
// ============================================================================

/**
 * Async state for store data - matches pattern from existing AccountData.
 */
export type AsyncState<T> =
	| { status: 'idle'; account: undefined }
	| { status: 'loading'; account: `0x${string}` }
	| { status: 'ready'; account: `0x${string}`; data: T };

// ============================================================================
// Change Tracking Types
// ============================================================================

/**
 * Represents a change detected during merge.
 * Event names are field-specific like "settings:changed" or "operations:added".
 */
export type StoreChange =
	| { event: `${string}:changed`; data: unknown }
	| { event: `${string}:added`; data: { key: string; item: unknown } }
	| { event: `${string}:updated`; data: { key: string; item: unknown } }
	| { event: `${string}:removed`; data: { key: string; item: unknown } };

// ============================================================================
// Server Sync Types
// ============================================================================

/**
 * Server sync adapter interface.
 * Implement this to sync with your backend.
 */
export interface SyncAdapter<S extends Schema> {
	/**
	 * Pull latest state from server.
	 * Returns null if no data exists on server.
	 */
	pull(account: `0x${string}`): Promise<InternalStorage<S> | null>;

	/**
	 * Push local changes to server.
	 * Returns merged state from server.
	 */
	push(account: `0x${string}`, changes: InternalStorage<S>): Promise<InternalStorage<S>>;

	/**
	 * Subscribe to real-time updates (optional).
	 */
	subscribe?(
		account: `0x${string}`,
		callback: (data: InternalStorage<S>) => void,
	): () => void;
}

/**
 * Sync configuration.
 */
export interface SyncConfig {
	/** Debounce delay for pushing changes (default: 1000ms) */
	debounceMs?: number;

	/** Interval for periodic sync (default: 30000ms, 0 to disable) */
	intervalMs?: number;

	/** Sync when tab becomes visible (default: true) */
	syncOnVisible?: boolean;

	/** Sync when coming back online (default: true) */
	syncOnReconnect?: boolean;

	/** Maximum retry attempts (default: 3) */
	maxRetries?: number;

	/** Initial backoff delay for retries (default: 1000ms) */
	retryBackoffMs?: number;
}
