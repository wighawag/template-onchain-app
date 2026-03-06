import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import type {TransactionIntent} from '@etherkit/tx-observer';
import {createObservableStore} from 'observator';

export type OnchainOperation = {
	type: 'set-greeting' | 'default';
	description: string;
	transactionIntent: TransactionIntent;
};

export type LocalState = {
	account?: `0x${string}`;
	operations: Record<number, OnchainOperation>;
};

export function createLocalState(params: {
	account: AccountStore;
	deployments: TypedDeployments;
}) {
	const {account, deployments} = params;
	function LOCAL_STORAGE_STATE_KEY(accountAddress: `0x${string}`) {
		return `__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${accountAddress}`;
	}

	const store = createObservableStore<LocalState>({
		account: undefined,
		operations: {},
	});
	store.on('*', () => {
		const state = store.getState();
		const account = state.account;
		if (account) {
			try {
				localStorage.setItem(
					LOCAL_STORAGE_STATE_KEY(account),
					JSON.stringify(state),
				);
			} catch (err) {
				console.error(`failed to write to local storage`, err);
			}
		}
	});

	function reset(state?: LocalState) {
		store.update((v: any) => {
			v.account = undefined;
			v.operations = {};
			if (state) {
				for (const key of Object.keys(state)) {
					v[key] = (state as any)[key];
				}
			}
		});
	}

	let unsubscribeFromAccount: (() => void) | undefined;
	function stop() {
		unsubscribeFromAccount?.();
	}

	function start() {
		unsubscribeFromAccount = account.subscribe(($account) => {
			const state = store.getState();
			if ($account != state.account) {
				if ($account) {
					try {
						const fromStorageStr = localStorage.getItem(
							LOCAL_STORAGE_STATE_KEY($account),
						);
						if (fromStorageStr) {
							const fromStorage = JSON.parse(fromStorageStr);
							reset(fromStorage);
						} else {
							reset();
						}
					} catch (err) {
						reset();
					}
				} else {
					reset();
				}
			}
		});

		return stop;
	}

	function addTransaction(
		transactionIntent: TransactionIntent,
		description: string,
		type: OnchainOperation['type'],
	) {
		const currentState = store.getState();
		let id = Date.now();
		while (currentState.operations[id]) {
			id++;
		}
		store.update((v) => {
			v.operations[id] = {
				type,
				description,
				transactionIntent,
			};
		});
	}

	return {
		start,
		stop,
		addTransaction,
		...store,
	};
}
