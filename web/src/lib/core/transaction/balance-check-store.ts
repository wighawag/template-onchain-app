import { writable } from 'svelte/store';

export type BalanceCheckState =
	| { step: 'idle' }
	| { step: 'estimating' }
	| {
			step: 'insufficient';
			balance: bigint;
			estimatedCost: bigint;
			shortfall: bigint;
			onDismiss: () => void;
	  };

function createBalanceCheckStore() {
	const { subscribe, set } = writable<BalanceCheckState>({ step: 'idle' });

	return {
		subscribe,
		startEstimating: () => set({ step: 'estimating' }),
		showInsufficientFunds: (data: {
			balance: bigint;
			estimatedCost: bigint;
			shortfall: bigint;
			onDismiss: () => void;
		}) => set({ step: 'insufficient', ...data }),
		close: () => set({ step: 'idle' }),
	};
}

export const balanceCheckStore = createBalanceCheckStore();
