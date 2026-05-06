import {writable, get} from 'svelte/store';
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
			// Faucet tracking
			faucetClaimedAt?: number;
			preFaucetBalance?: bigint;
			isWaitingForBalanceUpdate: boolean;
	  };

export function createBalanceCheckStore() {
	const {subscribe, set, update} = writable<BalanceCheckState>({step: 'idle'});

	let pollingInterval: NodeJS.Timeout | undefined;

	function stopPolling() {
		if (pollingInterval) {
			clearInterval(pollingInterval);
			pollingInterval = undefined;
		}
	}

	function startPolling(balanceStore: BalanceStore, preFaucetBalance: bigint) {
		stopPolling();

		pollingInterval = setInterval(() => {
			const currentBalance = get(balanceStore);
			if (currentBalance.step === 'Loaded') {
				// Check if balance has changed from pre-faucet value
				if (currentBalance.value !== preFaucetBalance) {
					// Balance has changed, stop polling
					stopPolling();

					// Update state to indicate we're no longer waiting
					update((state) => {
						if (state.step === 'insufficient') {
							return {
								...state,
								isWaitingForBalanceUpdate: false,
								preFaucetBalance: undefined,
								faucetClaimedAt: undefined,
							};
						}
						return state;
					});
				}
			}
		}, 1000);

		// Also set a timeout to stop polling after 30 seconds
		setTimeout(() => {
			stopPolling();
			update((state) => {
				if (state.step === 'insufficient') {
					return {
						...state,
						isWaitingForBalanceUpdate: false,
						preFaucetBalance: undefined,
						faucetClaimedAt: undefined,
					};
				}
				return state;
			});
		}, 30000);
	}

	return {
		subscribe,
		startEstimating: () => set({step: 'estimating'}),
		showInsufficientFunds: (data: {
			balanceStore: BalanceStore;
			estimatedCost: bigint;
			onContinue: () => void;
			onDismiss: () => void;
		}) =>
			set({
				step: 'insufficient',
				balanceStore: data.balanceStore,
				estimatedCost: data.estimatedCost,
				onContinue: data.onContinue,
				onDismiss: data.onDismiss,
				isWaitingForBalanceUpdate: false,
			}),
		close: () => {
			stopPolling();
			set({step: 'idle'});
		},
		markFaucetClaimed: (preFaucetBalance: bigint) => {
			update((state) => {
				if (state.step === 'insufficient') {
					// Start polling for balance change
					startPolling(state.balanceStore, preFaucetBalance);

					return {
						...state,
						faucetClaimedAt: Date.now(),
						preFaucetBalance,
						isWaitingForBalanceUpdate: true,
					};
				}
				return state;
			});
		},
	};
}

export type BalanceCheckStore = ReturnType<typeof createBalanceCheckStore>;
