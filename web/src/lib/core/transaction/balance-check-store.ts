import {writable} from 'svelte/store';
import type {BalanceStore} from '$lib/core/connection/balance';

export type BalanceCheckState =
	| {step: 'idle'}
	| {step: 'estimating'}
	| {
			step: 'insufficient';
			balanceStore: BalanceStore;
			estimatedCost: bigint;
			onContinue: () => void;
			onDismiss: () => void;
	  };

function createBalanceCheckStore() {
	const {subscribe, set} = writable<BalanceCheckState>({step: 'idle'});

	return {
		subscribe,
		startEstimating: () => set({step: 'estimating'}),
		showInsufficientFunds: (data: {
			balanceStore: BalanceStore;
			estimatedCost: bigint;
			onContinue: () => void;
			onDismiss: () => void;
		}) => set({step: 'insufficient', ...data}),
		close: () => set({step: 'idle'}),
	};
}

export const balanceCheckStore = createBalanceCheckStore();
