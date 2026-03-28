import {writable, type Readable} from 'svelte/store';
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

/**
 * Extracts a meaningful error message from an error object,
 * looking at the cause chain if the top-level message is a wrapper.
 */
function extractErrorMessage(error: {message: string; cause?: unknown}): string {
	// If there's a cause, try to get a more specific message from it
	if (error.cause) {
		const cause = error.cause as Record<string, unknown>;

		// Check for common error properties
		if (typeof cause.message === 'string') {
			return cause.message;
		}
		if (typeof cause.details === 'string') {
			return cause.details;
		}
		if (typeof cause.shortMessage === 'string') {
			return cause.shortMessage;
		}
		// For viem errors, check for specific error info
		if (typeof cause.status === 'number') {
			return `HTTP ${cause.status}`;
		}
		// Recursively check nested cause
		if (cause.cause && typeof cause.cause === 'object') {
			const nested = cause.cause as Record<string, unknown>;
			if (typeof nested.message === 'string') {
				return nested.message;
			}
		}
	}

	// Fall back to the wrapper message
	return error.message;
}

function categorizeError(error: {message: string; cause?: unknown}): RpcErrorCategory {
	// Extract the actual error message, looking at cause if available
	const errorMessage = extractErrorMessage(error);
	const msg = errorMessage.toLowerCase();

	if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) return 'timeout';
	if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) return 'rate-limit';
	if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('internal server error')) return 'server-error';
	if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('failed to fetch')) return 'network';
	return 'unknown';
}

export function createRpcHealthStore(params: {
	balance: BalanceStore;
	gasFee: GasFeeStore;
}): RpcHealthStore {
	const {balance, gasFee} = params;

	// Use writable store to manage state properly instead of closure variables
	// This follows the same pattern as balance.ts and gasFee.ts
	let $state: RpcHealthValue = {healthy: true, error: null};
	let errorSince: number | undefined;
	const _store = writable<RpcHealthValue>($state);

	function setState(state: RpcHealthValue) {
		$state = state;
		_store.set($state);
	}

	let unsubscribeBalance: (() => void) | undefined;
	let unsubscribeGasFee: (() => void) | undefined;
	let $balanceStatus: BalanceStatus = {loading: false};
	let $gasFeeStatus: GasFeeStatus = {loading: false};

	function updateHealth() {
		const balanceError = $balanceStatus.error;
		const gasFeeError = $gasFeeStatus.error;
		const isLoading = $balanceStatus.loading || $gasFeeStatus.loading;

		// If either has an error, we're unhealthy
		if (balanceError || gasFeeError) {
			const error = balanceError || gasFeeError!;
			const errorMessage = error.message;
			const category = categorizeError(error);

			if (!errorSince) {
				errorSince = Date.now();
			}

			setState({
				healthy: false,
				error: {
					category,
					message: errorMessage,
					since: errorSince,
				},
			});
			return;
		}

		// If loading and we had a previous error, maintain unhealthy state
		// This prevents blinking during retry attempts
		if (isLoading && $state.error) {
			// Keep current state (already unhealthy)
			return;
		}

		// Healthy: no errors and not loading with a previous error
		errorSince = undefined;
		setState({healthy: true, error: null});
	}

	function start() {
		unsubscribeBalance = balance.status.subscribe((status) => {
			$balanceStatus = status;
			updateHealth();
		});

		unsubscribeGasFee = gasFee.status.subscribe((status) => {
			$gasFeeStatus = status;
			updateHealth();
		});

		return stop;
	}

	function stop() {
		errorSince = undefined;
		setState({healthy: true, error: null});

		if (unsubscribeBalance) {
			unsubscribeBalance();
			unsubscribeBalance = undefined;
		}
		if (unsubscribeGasFee) {
			unsubscribeGasFee();
			unsubscribeGasFee = undefined;
		}
	}

	// Create the writable store with start/stop lifecycle
	const store = writable<RpcHealthValue>({healthy: true, error: null}, start);

	return {
		subscribe: store.subscribe,
	};
}
