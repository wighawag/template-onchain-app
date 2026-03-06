import type {AsyncStorage} from '$lib/core/storage';
import type {AccountStore} from '$lib/core/connection/types';
import {createEmitter} from 'radiate';

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
 * A mutation function that operates on state.
 * First param is always state, rest are user-provided args.
 * Event names are constrained to keys of the Events type.
 */
export type MutationFn<
	S,
	EventKeys extends string,
	Args extends unknown[] = unknown[],
	R = unknown,
> = (state: S, ...args: Args) => MutationResult<R, EventKeys>;

/**
 * Helper to create typed mutations with constrained event names.
 * Uses curried form: createMutations<State, Events>()(mutations)
 *
 * This ensures typos in event names are caught at compile time without
 * requiring explicit return type annotations on each mutation.
 *
 * @example
 * ```typescript
 * const mutations = createMutations<LocalState, Events>()({
 *   addItem(state, name: string) {
 *     state.items.push(name);
 *     return { result: state.items.length, event: 'items' }; // 'items' validated against Events
 *   }
 * });
 * ```
 */
export function createMutations<S, E extends Record<string, unknown>>() {
	return <
		M extends Record<
			string,
			(state: S, ...args: any[]) => MutationResult<any, keyof E & string>
		>,
	>(
		mutations: M,
	): M => mutations;
}

/**
 * Configuration for createAccountStore.
 */
type AccountStoreConfig<
	S,
	E extends Record<string, unknown>,
	M extends Record<string, MutationFn<S, keyof E & string, any[], any>>,
> = {
	/** Factory to create default state */
	defaultState: (account?: `0x${string}`) => S;

	/** Pure mutation functions - just mutate state and return result + event */
	mutations: M;

	/** Async storage adapter */
	storage: AsyncStorage<S>;

	/** Function to generate storage key from account */
	storageKey: (account: `0x${string}`) => string;

	/** Account store to subscribe to */
	account: AccountStore;

	/**
	 * Events to emit when state is loaded (account switch or initial load).
	 * Each event is emitted with the state (or a derived value) as data.
	 * Example: `onLoad: (state) => [{ event: 'operations:set', data: state.operations }]`
	 */
	onLoad?: (state: S) => Array<{event: keyof E & string; data: E[keyof E]}>;

	/**
	 * Events to emit when state is cleared (account switch).
	 * Called before loading the new account's state.
	 * Example: `onClear: () => [{ event: 'operations:cleared', data: undefined }]`
	 */
	onClear?: () => Array<{event: keyof E & string; data: E[keyof E]}>;
};

/**
 * Creates an account-aware store with automatic wiring.
 *
 * @typeParam S - The state type
 * @typeParam E - The events type (e.g., `{operations: Record<number, Op>; operation: {id: number; operation: Op}}`)
 * @typeParam M - The mutations record type (events constrained to keyof E)
 *
 * - Current account: in-memory + fire-and-forget save + emit events
 * - Different account: load-modify-save with serialization, no events
 */
export function createAccountStore<
	S extends {account?: `0x${string}`},
	E extends Record<string, unknown>,
	M extends Record<string, MutationFn<S, keyof E & string, any[], any>>,
>(config: AccountStoreConfig<S, E, M>) {
	const {
		defaultState,
		mutations,
		storage,
		storageKey,
		account,
		onLoad,
		onClear,
	} = config;

	// Emitter with properly typed events including loading state
	const emitter = createEmitter<E & {state: S; loading: boolean}>();

	let state = defaultState();
	let loading = false;
	const pendingSaves = new Map<string, Promise<void>>();
	let loadGeneration = 0;

	// Storage helpers
	const _load = async (acc: `0x${string}`) =>
		(await storage.load(storageKey(acc))) ?? defaultState(acc);

	const _save = async (acc: `0x${string}`, s: S) =>
		storage.save(storageKey(acc), s);

	// Emit clear events
	function _emitClearEvents(): void {
		if (onClear) {
			for (const {event, data} of onClear()) {
				emitter.emit(
					event as keyof (E & {state: S; loading: boolean}),
					data as any,
				);
			}
		}
	}

	// Emit load events
	function _emitLoadEvents(s: S): void {
		if (onLoad) {
			for (const {event, data} of onLoad(s)) {
				emitter.emit(
					event as keyof (E & {state: S; loading: boolean}),
					data as any,
				);
			}
		}
	}

	// Core helper
	async function _withState<T>(
		acc: `0x${string}`,
		mutation: (s: S) => MutationResult<T, keyof E & string>,
	): Promise<T> {
		const isCurrentAccount = acc === state.account;

		if (isCurrentAccount) {
			const {result, event, eventData} = mutation(state);
			_save(acc, state).catch(() => {});
			if (event)
				emitter.emit(
					event as keyof (E & {state: S; loading: boolean}),
					(eventData ?? state) as any,
				);
			return result;
		}

		// Cross-account path
		const pending = pendingSaves.get(acc);
		if (pending) await pending;

		const targetState = await _load(acc);
		const {result} = mutation(targetState);

		const savePromise = _save(acc, targetState);
		pendingSaves.set(acc, savePromise);
		await savePromise;
		pendingSaves.delete(acc);

		return result;
	}

	// Account switching
	async function setAccount(newAccount?: `0x${string}`): Promise<void> {
		if (newAccount === state.account) return;

		const emitClearEvents = state.account;

		// Immediately set state to default for new account (clears old account data)
		state = defaultState(newAccount);

		if (emitClearEvents) {
			_emitClearEvents();
		}

		// If no account, we're done (no loading needed)
		if (!newAccount) {
			emitter.emit(
				'state',
				state as (E & {state: S; loading: boolean})['state'],
			);
			_emitLoadEvents(state);
			return;
		}

		// Set loading state and emit loading event
		loading = true;
		emitter.emit(
			'loading',
			true as (E & {state: S; loading: boolean})['loading'],
		);

		loadGeneration++;
		const gen = loadGeneration;

		// Load stored state for the new account
		const loadedState = await _load(newAccount);

		// Only apply if this is still the current load generation
		if (gen === loadGeneration) {
			state = loadedState;
		}

		// Clear loading state and emit loading event
		loading = false;
		emitter.emit(
			'loading',
			false as (E & {state: S; loading: boolean})['loading'],
		);

		// Emit state event
		emitter.emit('state', state as (E & {state: S; loading: boolean})['state']);
		// Emit configured load events
		_emitLoadEvents(state);
	}

	// Auto-wrap all mutations with _withState
	type WrappedMutations = {
		[K in keyof M]: M[K] extends MutationFn<S, any, infer Args, infer R>
			? (account: `0x${string}`, ...args: Args) => Promise<R>
			: never;
	};

	const wrappedMutations = {} as WrappedMutations;
	for (const [name, fn] of Object.entries(mutations)) {
		(wrappedMutations as any)[name] = (
			acc: `0x${string}`,
			...args: unknown[]
		) => _withState(acc, (s) => fn(s, ...args));
	}

	// Start/stop
	let unsub: (() => void) | undefined;
	const start = () => {
		unsub = account.subscribe(setAccount);
		return stop;
	};
	const stop = () => unsub?.();

	return {
		/** Current state (readonly) */
		get state() {
			return state as Readonly<S>;
		},
		/** Whether data is currently being loaded (account switch in progress) */
		get loading() {
			return loading;
		},
		...wrappedMutations,
		on: emitter.on,
		off: emitter.off,
		start,
		stop,
	};
}
