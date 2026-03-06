import {
	createAccountStore,
	createMutations,
} from '$lib/core/account/createAccountStore';
import {createLocalStorageAdapter, type AsyncStorage} from '$lib/core/storage';
import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import type {TransactionIntent} from '@etherkit/tx-observer';

export type OnchainOperation = {
	type: 'set-greeting' | 'default';
	description: string;
	transactionIntent: TransactionIntent;
};

export type LocalState = {
	account?: `0x${string}`;
	operations: Record<number, OnchainOperation>;
};

/**
 * Event types emitted by the store.
 * - `operations:added`: Fires when an operation is added
 * - `operations:removed`: Fires when an operation is removed
 * - `operations:cleared`: Fires when all operations are cleared (account switch)
 * - `operations:set`: Fires when operations are set (initial load after account switch)
 * - `operation`: Fires when an existing operation is modified (content changes only)
 */
type Events = {
	/** Fires when an operation is added */
	'operations:added': {id: number; operation: OnchainOperation};
	/** Fires when an operation is removed */
	'operations:removed': {id: number; operation: OnchainOperation};
	/** Fires when all operations are cleared (account switch, before loading) */
	'operations:cleared': undefined;
	/** Fires when operations are set (initial load after account switch) */
	'operations:set': LocalState['operations'];
	/** Fires when an existing operation is modified (content changes only) */
	operation: {id: number; operation: OnchainOperation};
};

/**
 * Pure mutations - just business logic, no async/storage concerns!
 * Event names are type-checked against the Events type via createMutations.
 * Typos like 'operationss' will cause compile errors.
 */
const mutations = createMutations<LocalState, Events>()({
	addOperation(
		state,
		transactionIntent: TransactionIntent,
		description: string,
		type: OnchainOperation['type'],
	) {
		let id = Date.now();
		while (state.operations[id]) id++;
		const operation = {type, description, transactionIntent};
		state.operations[id] = operation;
		return {
			result: id,
			event: 'operations:added',
			eventData: {id, operation},
		};
	},

	setOperation(state, id: number, operation: OnchainOperation) {
		const isNew = !state.operations[id];
		state.operations[id] = operation;
		if (isNew) {
			return {
				result: undefined,
				event: 'operations:added',
				eventData: {id, operation},
			};
		}
		return {
			result: undefined,
			event: 'operation',
			eventData: {id, operation},
		};
	},

	removeOperation(state, id: number) {
		const operation = state.operations[id];
		if (!operation) return {result: false};
		delete state.operations[id];
		return {
			result: true,
			event: 'operations:removed',
			eventData: {id, operation},
		};
	},
});

export function createAccountData(params: {
	account: AccountStore;
	deployments: TypedDeployments;
	storage?: AsyncStorage<LocalState>;
}) {
	const {
		account,
		deployments,
		storage = createLocalStorageAdapter<LocalState>(),
	} = params;

	return createAccountStore<LocalState, Events, typeof mutations>({
		account,
		storage,

		storageKey: (addr) =>
			`__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${addr}`,

		defaultState: (account) => ({account, operations: {}}),

		// Emit 'operations:cleared' event when account is being switched (before loading)
		onClear: () => [{event: 'operations:cleared', data: undefined}],

		// Emit 'operations:set' event when state is loaded (account switch)
		onLoad: (state) => [{event: 'operations:set', data: state.operations}],

		mutations,
	});
}

export type AccountData = ReturnType<typeof createAccountData>;
