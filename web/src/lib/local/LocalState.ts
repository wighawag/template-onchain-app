import type {TransactionIntent} from '@etherkit/tx-observer';
import {createObservableStore} from 'observator';

export type FuzdSubmission = {
	readonly id: string;
	state: {}; // TODO
};

export type OnchainOperation = {
	transactionIntent: TransactionIntent;
	fuzd?: FuzdSubmission;
};

export type LocalState = {
	operations: Record<number, OnchainOperation>;
};

export function createLocalState() {
	const store = createObservableStore<LocalState>({
		operations: {},
	});

	return {
		...store,
	};
}
