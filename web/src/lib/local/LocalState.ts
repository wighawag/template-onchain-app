import type {BroadcastedTransaction} from '$lib/core/transactions/processor';
import {createObservableStore} from 'observator';

export type FuzdSubmission = {
	readonly id: string;
	state: {}; // TODO
};

export type OnchainOperation = {
	transactions: BroadcastedTransaction[];
	fuzd?: FuzdSubmission;
	expectedUpdate?:
		| {
				event: {topics: `0x${string}`[]};
		  }
		| {
				functionCall: {name: string; result: `0x${string}`};
		  };
};

export function createLocalState() {
	return createObservableStore({});
}
