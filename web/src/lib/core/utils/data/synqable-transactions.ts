/**
 * Synqable utility functions for working with MultiAccountStore
 */

import type {
	Schema,
	MapKeys,
	ExtractMapItem,
	SyncableStore,
	DataOf,
} from 'synqable';

/**
 * Observer interface for receiving map item changes.
 * Follows a simple add/remove/clear pattern.
 */
export interface MapObserver<T> {
	add: (key: string, value: T) => void;
	remove: (key: string) => void;
	clear: () => void;
	addMultiple: (values: {[id: string]: T}) => void;
}

/**
 * Minimal interface for a subscribable multi-account store.
 * This allows the function to work with any store that follows the pattern.
 */
export interface SubscribableMultiAccountStore<S extends Schema> {
	subscribe: (callback: (store: SyncableStore<S> | null) => void) => () => void;
}

/**
 * Item type with deleteAt included, matching what SyncableStore returns for map items.
 */
type MapItemWithDeleteAt<
	S extends Schema,
	K extends MapKeys<S>,
> = ExtractMapItem<S[K]> & {deleteAt: number};

/**
 * Creates a subscription that syncs map items from a MultiAccountStore
 * to an observer, handling account switches automatically.
 *
 * This provides:
 * - Automatic cleanup and re-subscription on account changes
 * - Incremental add/remove events for efficient updates
 * - Bulk sync when store becomes ready
 *
 * @example
 * ```typescript
 * const unsubscribe = createMapToObserverSync({
 *   accountData,
 *   mapKey: 'operations',
 *   extractValue: (item) => item.transactionIntent,
 *   observer: txObserver,
 * });
 * ```
 */
export function hookTxObserverToAccountData<
	S extends Schema,
	K extends MapKeys<S>,
	T,
>(params: {
	accountData: SubscribableMultiAccountStore<S>;
	mapKey: K;
	extractValue: (item: MapItemWithDeleteAt<S, K>) => T;
	observer: MapObserver<T>;
}): () => void {
	const {accountData, mapKey, extractValue, observer} = params;

	let currentAccountSubscription:
		| {account: `0x${string}`; unsubscribe: () => void}
		| undefined;

	const unsubscribeFromAccountData = accountData.subscribe(
		(currentAccountData) => {
			if (currentAccountData) {
				if (
					!currentAccountSubscription ||
					currentAccountSubscription.account !== currentAccountData.account
				) {
					currentAccountSubscription?.unsubscribe();
					observer.clear();

					// Build event names - use 'any' for the event type since synqable's
					// type system doesn't support generic map key event inference
					const addedEvent = `${String(mapKey)}:added`;
					const removedEvent = `${String(mapKey)}:removed`;

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const unsubFromAdded = (currentAccountData.on as any)(
						addedEvent,
						(data: {key: string; item: MapItemWithDeleteAt<S, K>}) => {
							observer.add(data.key, extractValue(data.item));
						},
					);

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const unsubFromRemoved = (currentAccountData.on as any)(
						removedEvent,
						(data: {key: string}) => {
							observer.remove(data.key);
						},
					);

					const unsubFromState = currentAccountData.state$.subscribe(
						(state) => {
							if (state.status === 'ready') {
								const currentState = currentAccountData.get();
								if (currentState && currentState.status === 'ready') {
									// Access the map data using the key, with proper type assertion
									const data = currentState.data as DataOf<S>;
									const mapData = data[mapKey as keyof DataOf<S>] as Record<
										string,
										MapItemWithDeleteAt<S, K>
									>;
									const values: {[id: string]: T} = {};
									for (const id in mapData) {
										values[id] = structuredClone(
											extractValue(mapData[id]),
										) as T;
									}
									observer.addMultiple(values);
								}
							}
						},
					);

					currentAccountSubscription = {
						account: currentAccountData.account,
						unsubscribe: () => {
							unsubFromAdded();
							unsubFromRemoved();
							unsubFromState();
						},
					};
				}
			} else {
				currentAccountSubscription?.unsubscribe();
				currentAccountSubscription = undefined;
				observer.clear();
			}
		},
	);

	return unsubscribeFromAccountData;
}
