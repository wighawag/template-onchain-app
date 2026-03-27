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

	return derived<[Readable<BalanceStatus>, Readable<GasFeeStatus>], RpcHealthValue>(
		[balance.status, gasFee.status],
		([$balanceStatus, $gasFeeStatus]) => {
			const balanceError = $balanceStatus.error;
			const gasFeeError = $gasFeeStatus.error;

			// Healthy if neither has errors
			if (!balanceError && !gasFeeError) {
				errorSince = undefined;
				return {healthy: true, error: null};
			}

			// Use the first available error for categorization
			const errorMessage = balanceError?.message || gasFeeError?.message || 'Unknown RPC error';
			const category = categorizeError(errorMessage);

			if (!errorSince) {
				errorSince = Date.now();
			}

			return {
				healthy: false,
				error: {
					category,
					message: errorMessage,
					since: errorSince,
				},
			};
		},
	);
}
