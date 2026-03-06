import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import type {TransactionIntent} from '@etherkit/tx-observer';
import {createEmitter} from 'radiate';

export type OnchainOperation = {
	type: 'set-greeting' | 'default';
	description: string;
	transactionIntent: TransactionIntent;
};

export type LocalState = {
	account?: `0x${string}`;
	operations: Record<number, OnchainOperation>;
};

type Events = {
	// Fires when operations are added or removed (structural changes)
	operations: LocalState['operations'];
	// Fires when an existing operation is modified (content changes only)
	operation: {id: number; operation: OnchainOperation};
};

export function createLocalStore(params: {
	account: AccountStore;
	deployments: TypedDeployments;
}) {
	const {account, deployments} = params;
	const emitter = createEmitter<Events>();

	function _storageKey(addr: `0x${string}`) {
		return `__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${addr}`;
	}

	function defaultState(account?: `0x${string}`): LocalState {
		return {account, operations: {}};
	}
	let state = defaultState();

	function _persist(account: `0x${string}` | undefined, state: LocalState) {
		if (account) {
			try {
				localStorage.setItem(_storageKey(account), JSON.stringify(state));
			} catch {}
		}
	}
	function _load(account?: `0x${string}`): LocalState {
		if (account) {
			try {
				const stored = localStorage.getItem(_storageKey(account));
				return stored ? JSON.parse(stored) : defaultState(account);
			} catch (e) {
				return defaultState(account);
			}
		}
		return defaultState();
	}

	// Actions
	function setAccount(account?: `0x${string}`) {
		if (account === state.account) return;
		state = _load(account);
		emitter.emit('operations', state.operations);
	}

	function addOperation(
		transactionIntent: TransactionIntent,
		description: string,
		type: OnchainOperation['type'],
	) {
		let id = Date.now();
		while (state.operations[id]) id++;
		const operation = {type, description, transactionIntent};
		state.operations[id] = operation;
		emitter.emit('operations', state.operations);
		_persist(state.account, state);
	}

	function setOperation(id: number, operation: OnchainOperation) {
		if (!state.operations[id]) {
			state.operations[id] = operation;
			emitter.emit('operations', state.operations);
			_persist(state.account, state);
		} else {
			state.operations[id] = operation;
			emitter.emit('operation', {id, operation});
			_persist(state.account, state);
		}
	}

	function removeOperation(id: number) {
		if (!state.operations[id]) return;
		delete state.operations[id];
		emitter.emit('operations', state.operations);
		_persist(state.account, state);
	}

	// Sync with account store
	let _unsubscribeFromAccount: (() => void) | undefined;
	function start() {
		_unsubscribeFromAccount = account.subscribe(setAccount);
		return stop;
	}
	function stop() {
		_unsubscribeFromAccount?.();
	}

	return {
		state: state as Readonly<LocalState>,
		start,
		stop,
		on: emitter.on,
		off: emitter.off,
		addOperation,
		setOperation,
		removeOperation,
	};
}
