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

/**
 * Data stored per account
 */
export type AccountData = {
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
	'operations:set': AccountData['operations'];
	/** Fires when an existing operation is modified (content changes only) */
	'operation:updated': {id: number; operation: OnchainOperation};
};

/**
 * Pure mutations - just business logic, no async/storage concerns!
 * Event names are type-checked against the Events type via createMutations.
 * Typos like 'operationss' will cause compile errors.
 */
const mutations = createMutations<AccountData, Events>()({
	addOperation(
		data,
		transactionIntent: TransactionIntent,
		description: string,
		type: OnchainOperation['type'],
	) {
		let id = Date.now();
		while (data.operations[id]) id++;
		const operation = {type, description, transactionIntent};
		data.operations[id] = operation;
		return {
			result: id,
			event: 'operations:added',
			eventData: {id, operation},
		};
	},

	setOperation(data, id: number, operation: OnchainOperation) {
		const isNew = !data.operations[id];
		data.operations[id] = operation;
		if (isNew) {
			return {
				result: undefined,
				event: 'operations:added',
				eventData: {id, operation},
			};
		}
		return {
			result: undefined,
			event: 'operation:updated',
			eventData: {id, operation},
		};
	},

	removeOperation(data, id: number) {
		const operation = data.operations[id];
		if (!operation) return {result: false};
		delete data.operations[id];
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
	storage?: AsyncStorage<AccountData>;
}) {
	const {
		account,
		deployments,
		storage = createLocalStorageAdapter<AccountData>(),
	} = params;

	return createAccountStore<AccountData, Events, typeof mutations>({
		account,
		storage,

		storageKey: (addr) =>
			`__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${addr}`,

		defaultData: () => ({operations: {}}),

		// Emit 'operations:cleared' event when account is being switched (before loading)
		onClear: () => [{event: 'operations:cleared', data: undefined}],

		// Emit 'operations:set' event when data is loaded (account switch)
		onLoad: (data) => [{event: 'operations:set', data: data.operations}],

		mutations,
	});
}

export type AccountDataStore = ReturnType<typeof createAccountData>;
