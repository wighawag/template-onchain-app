import {derived, type Readable} from 'svelte/store';
import type {BalanceStatus, BalanceStore} from './balance';
import type {GasFeeStatus, GasFeeStore} from './gasFee';

export type RpcErrorCategory = 'network' | 'timeout' | 'rate-limit' | 'server-error' | 'unknown';

export type RpcError = {
	category: RpcErrorCategory;
	message: string;
	since: number;
};

export type RpcHealthValue = {
	healthy: boolean;
	error: RpcError | null;
};

export type RpcHealthStore = Readable<RpcHealthValue>;

function categorizeError(errorMessage: string): RpcErrorCategory {
	const msg = errorMessage.toLowerCase();
	if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
	if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) return 'rate-limit';
	if (msg.includes('5') && (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504'))) return 'server-error';
	if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('enotfound')) return 'network';
	return 'unknown';
}

export function createRpcHealthStore(params: {
	balance: BalanceStore;
	gasFee: GasFeeStore;
}): RpcHealthStore {
	const {balance, gasFee} = params;

	let errorSince: number | undefined;
	let lastError: RpcError | null = null;

	return derived<[Readable<BalanceStatus>, Readable<GasFeeStatus>], RpcHealthValue>(
		[balance.status, gasFee.status],
		([$balanceStatus, $gasFeeStatus]) => {
			const balanceError = $balanceStatus.error;
			const gasFeeError = $gasFeeStatus.error;
			const isLoading = $balanceStatus.loading || $gasFeeStatus.loading;

			// If either has an error, we're unhealthy
			if (balanceError || gasFeeError) {
				const errorMessage = balanceError?.message || gasFeeError?.message || 'Unknown RPC error';
				const category = categorizeError(errorMessage);

				if (!errorSince) {
					errorSince = Date.now();
				}

				lastError = {
					category,
					message: errorMessage,
					since: errorSince,
				};

				return {
					healthy: false,
					error: lastError,
				};
			}

			// If loading and we had a previous error, maintain unhealthy state
			// This prevents blinking during retry attempts
			if (isLoading && lastError) {
				return {
					healthy: false,
					error: lastError,
				};
			}

			// Healthy: no errors and not loading with a previous error
			errorSince = undefined;
			lastError = null;
			return {healthy: true, error: null};
		},
	);
}
