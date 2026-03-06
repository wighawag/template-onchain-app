import type {AsyncStorage} from '$lib/core/storage';
import type {AccountStore} from '$lib/core/connection/types';
import {createEmitter} from 'radiate';

/**
 * Async state wrapper for account-bound data.
 * Discriminated union ensures type-safe data access.
 */
export type AsyncState<D> =
	| {status: 'idle'; account: undefined}
	| {status: 'loading'; account: `0x${string}`}
	| {status: 'ready'; account: `0x${string}`; data: D};

/**
 * Result of a state mutation.
 * Event names are constrained to valid keys from the Events type.
 */
export type MutationResult<T, E extends string> = {
	result: T;
	event?: E;
	eventData?: unknown;
};

/**
 * A mutation function that operates on data.
 * First param is always data, rest are user-provided args.
 * Event names are constrained to keys of the Events type.
 */
export type MutationFn<
	D,
	EventKeys extends string,
	Args extends unknown[] = unknown[],
	R = unknown,
> = (data: D, ...args: Args) => MutationResult<R, EventKeys>;

/**
 * Helper to create typed mutations with constrained event names.
 * Uses curried form: createMutations<Data, Events>()(mutations)
 *
 * This ensures typos in event names are caught at compile time without
 * requiring explicit return type annotations on each mutation.
 *
 * @example
 * ```typescript
 * const mutations = createMutations<OperationsData, Events>()({
 *   addItem(data, name: string) {
 *     data.items.push(name);
 *     return { result: data.items.length, event: 'items' }; // 'items' validated against Events
 *   }
 * });
 * ```
 */
export function createMutations<D, E extends Record<string, unknown>>() {
	return <
		M extends Record<
			string,
			(data: D, ...args: any[]) => MutationResult<any, keyof E & string>
		>,
	>(
		mutations: M,
	): M => mutations;
}

/**
 * Configuration for createAccountStore.
 */
type AccountStoreConfig<
	D,
	E extends Record<string, unknown>,
	M extends Record<string, MutationFn<D, keyof E & string, any[], any>>,
> = {
	/** Factory to create default data for a new account */
	defaultData: () => D;

	/** Pure mutation functions - just mutate data and return result + event */
	mutations: M;

	/** Async storage adapter - stores D (data), not AsyncState */
	storage: AsyncStorage<D>;

	/** Function to generate storage key from account */
	storageKey: (account: `0x${string}`) => string;

	/** Account store to subscribe to */
	account: AccountStore;

	/**
	 * Events to emit when data is loaded (account switch or initial load).
	 * Receives the loaded data.
	 */
	onLoad?: (data: D) => Array<{event: keyof E & string; data: E[keyof E]}>;

	/**
	 * Events to emit when state is cleared (account switch).
	 * Called when transitioning away from ready state.
	 */
	onClear?: () => Array<{event: keyof E & string; data: E[keyof E]}>;
};

/**
 * Creates an account-aware store with automatic wiring.
 *
 * @typeParam D - The data type (stored inside AsyncState)
 * @typeParam E - The events type (e.g., `{operations: Record<number, Op>; operation: {id: number; operation: Op}}`)
 * @typeParam M - The mutations record type (events constrained to keyof E)
 *
 * - Current account: in-memory + fire-and-forget save + emit events
 * - Different account: load-modify-save with serialization, no events
 */
export function createAccountStore<
	D,
	E extends Record<string, unknown>,
	M extends Record<string, MutationFn<D, keyof E & string, any[], any>>,
>(config: AccountStoreConfig<D, E, M>) {
	const {
		defaultData,
		mutations,
		storage,
		storageKey,
		account,
		onLoad,
		onClear,
	} = config;

	// Emitter with properly typed events - state is now AsyncState<D>
	const emitter = createEmitter<E & {state: AsyncState<D>}>();

	let asyncState: AsyncState<D> = {status: 'idle', account: undefined};
	const pendingSaves = new Map<string, Promise<void>>();
	let loadGeneration = 0;

	// Storage helpers - loads D (data), not state with account
	const _load = async (acc: `0x${string}`): Promise<D> =>
		(await storage.load(storageKey(acc))) ?? defaultData();

	// Saves D (data)
	const _save = async (acc: `0x${string}`, data: D) =>
		storage.save(storageKey(acc), data);

	// Emit clear events
	function _emitClearEvents(): void {
		if (onClear) {
			for (const {event, data} of onClear()) {
				emitter.emit(event as keyof (E & {state: AsyncState<D>}), data as any);
			}
		}
	}

	// Emit load events - receives D (data) not S (state)
	function _emitLoadEvents(data: D): void {
		if (onLoad) {
			for (const {event, data: eventData} of onLoad(data)) {
				emitter.emit(
					event as keyof (E & {state: AsyncState<D>}),
					eventData as any,
				);
			}
		}
	}

	// Core helper - mutation operates on data
	async function _withState<T>(
		acc: `0x${string}`,
		mutation: (data: D) => MutationResult<T, keyof E & string>,
	): Promise<T> {
		// Can only mutate current account when ready
		const currentState = asyncState;
		if (currentState.status === 'ready' && currentState.account === acc) {
			const {result, event, eventData} = mutation(currentState.data);
			_save(acc, currentState.data).catch(() => {});
			if (event)
				emitter.emit(
					event as keyof (E & {state: AsyncState<D>}),
					(eventData ?? currentState.data) as any,
				);
			return result;
		}

		// Cross-account path (unchanged logic, just D instead of S)
		const pending = pendingSaves.get(acc);
		if (pending) await pending;

		const targetData = await _load(acc);
		const {result} = mutation(targetData);

		const savePromise = _save(acc, targetData);
		pendingSaves.set(acc, savePromise);
		await savePromise;
		pendingSaves.delete(acc);

		return result;
	}

	// Account switching
	async function setAccount(newAccount?: `0x${string}`): Promise<void> {
		// Same account - no change needed
		if (newAccount === asyncState.account) return;

		// Remember if we were ready (to emit clear events)
		const wasReady = asyncState.status === 'ready';

		// No account - transition to idle
		if (!newAccount) {
			asyncState = {status: 'idle', account: undefined};
			emitter.emit('state', asyncState);
			if (wasReady) {
				_emitClearEvents();
			}
			// Note: onLoad is NOT called for idle state (no data to load)
			return;
		}

		// Transition to loading state
		asyncState = {status: 'loading', account: newAccount};
		emitter.emit('state', asyncState);

		// Emit clear events after state shows loading (so listeners see clean state)
		if (wasReady) {
			_emitClearEvents();
		}

		// Track load generation for race condition handling
		loadGeneration++;
		const gen = loadGeneration;

		// Load data from storage
		const loadedData = await _load(newAccount);

		// Only apply if this is still the current load generation
		// (handles rapid account switching)
		if (gen !== loadGeneration) {
			return; // Another setAccount was called, abort this one
		}

		// Transition to ready state
		asyncState = {status: 'ready', account: newAccount, data: loadedData};
		emitter.emit('state', asyncState);

		// Emit load events
		_emitLoadEvents(loadedData);
	}

	// Auto-wrap all mutations with _withState
	type WrappedMutations = {
		[K in keyof M]: M[K] extends MutationFn<D, any, infer Args, infer R>
			? (account: `0x${string}`, ...args: Args) => Promise<R>
			: never;
	};

	const wrappedMutations = {} as WrappedMutations;
	for (const [name, fn] of Object.entries(mutations)) {
		(wrappedMutations as any)[name] = (
			acc: `0x${string}`,
			...args: unknown[]
		) => _withState(acc, (data) => fn(data, ...args));
	}

	// Start/stop
	let unsub: (() => void) | undefined;
	const start = () => {
		unsub = account.subscribe(setAccount);
		return stop;
	};
	const stop = () => unsub?.();

	return {
		/** Current async state (readonly) */
		get state(): Readonly<AsyncState<D>> {
			return asyncState;
		},
		...wrappedMutations,
		on: emitter.on.bind(emitter),
		off: emitter.off.bind(emitter),
		start,
		stop,
	};
}
