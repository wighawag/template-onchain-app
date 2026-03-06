import {createAccountStore, createMutations} from './createAccountStore';
import {createLocalStorageAdapter, type AsyncStorage} from '$lib/storage';
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
 * - `operations`: Fires when operations are added or removed (structural changes)
 * - `operation`: Fires when an existing operation is modified (content changes only)
 */
type Events = {
	/** Fires when operations are added or removed (structural changes) */
	operations: LocalState['operations'];
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
		state.operations[id] = {type, description, transactionIntent};
		return {result: id, event: 'operations'};
	},

	setOperation(state, id: number, operation: OnchainOperation) {
		const isNew = !state.operations[id];
		state.operations[id] = operation;
		if (isNew) {
			return {
				result: undefined,
				event: 'operations',
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
		if (!state.operations[id]) return {result: false};
		delete state.operations[id];
		return {result: true, event: 'operations'};
	},
});

export function createLocalStore(params: {
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

		// Emit 'operations' event when state is loaded (account switch)
		onLoad: (state) => [{event: 'operations', data: state.operations}],

		mutations,
	});
}

// Usage:
// const store = createLocalStore({ account, deployments });
// await store.addOperation(account, transactionIntent, 'desc', 'default');
// await store.setOperation(account, id, operation);
// await store.removeOperation(account, id);
// store.on('operations', (operations) => { ... });  // operations is typed as Record<number, OnchainOperation>
// store.on('operation', (data) => { ... });         // data is typed as {id: number; operation: OnchainOperation}
// store.on('state', (state) => { ... });            // state is typed as Readonly<LocalState>
