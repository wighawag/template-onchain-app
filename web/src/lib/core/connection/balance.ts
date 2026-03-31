import type {AccountStore} from '$lib/core/connection/types';
import {get, writable, type Readable} from 'svelte/store';
import type {PublicClient} from 'viem';

// New dual-store types
export type BalanceValue = {step: 'Unloaded'} | {step: 'Loaded'; value: bigint};

export type BalanceStatus = {
	loading: boolean;
	error?: {message: string; cause?: unknown};
	lastSuccessfulFetch?: number;
};

export type BalanceStore = {
	subscribe: Readable<BalanceValue>['subscribe'];
	status: Readable<BalanceStatus>;
	update(): void;
};

function defaultState(): BalanceValue {
	return {step: 'Unloaded'};
}

function defaultStatus(): BalanceStatus {
	return {loading: false};
}

export function createBalanceStore(
	params: {
		publicClient: PublicClient;
		account: AccountStore;
	},
	options?: {
		fetchInterval?: number;
	},
): BalanceStore {
	const {publicClient, account} = params;
	const fetchInterval = options?.fetchInterval || 5 * 1000;

	// Main store - discriminated union
	let $state: BalanceValue = defaultState();
	let $account = get(account);
	const _mainStore = writable<BalanceValue>($state, start);

	// Status store - loading/error
	let $status: BalanceStatus = defaultStatus();
	const _statusStore = writable<BalanceStatus>($status);

	function setState(state: BalanceValue) {
		$state = state;
		_mainStore.set($state);
	}

	function setStatus(status: BalanceStatus) {
		$status = status;
		_statusStore.set($status);
	}

	async function fetchState($account: `0x${string}`): Promise<boolean> {
		// Preserve lastSuccessfulFetch when setting loading state
		setStatus({
			loading: true,
			error: undefined,
			lastSuccessfulFetch: $status.lastSuccessfulFetch,
		});

		try {
			const balance = await publicClient.getBalance({address: $account});
			setState({step: 'Loaded', value: balance});
			// Set lastSuccessfulFetch on success
			setStatus({loading: false, lastSuccessfulFetch: Date.now()});
			return true;
		} catch (err) {
			// Preserve lastSuccessfulFetch on error
			setStatus({
				loading: false,
				error: {message: `failed to fetch balance for ${$account}`, cause: err},
				lastSuccessfulFetch: $status.lastSuccessfulFetch,
			});
			return false;
		}
	}

	async function fetchContinuously() {
		if (!$account) {
			setState({step: 'Unloaded'});
			setStatus({loading: false});
			return;
		}
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if ($account) {
			await fetchNow($account);
		}
	}

	async function fetchNow(account: `0x${string}`) {
		let interval = fetchInterval;
		try {
			const success = await fetchState(account);
			if (!success) {
				interval = 500;
			}
		} finally {
			if (!timeout) {
				timeout = setTimeout(fetchContinuously, interval);
			}
		}
	}

	let unsubscribeFromAccount: (() => void) | undefined;
	let timeout: NodeJS.Timeout | undefined;

	function start() {
		unsubscribeFromAccount = account.subscribe(async (newAccount) => {
			const signerChanged = $account != newAccount;

			if (signerChanged) {
				if (newAccount) {
					$account = newAccount;
					fetchContinuously();
				} else {
					setState({step: 'Unloaded'});
					setStatus({loading: false});
				}
			}
		});

		fetchContinuously();
		return stop;
	}

	async function update() {
		await fetchContinuously();
		return $state;
	}

	function stop() {
		setState(defaultState());
		setStatus(defaultStatus());

		if (unsubscribeFromAccount) {
			unsubscribeFromAccount();
			unsubscribeFromAccount = undefined;
		}

		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
	}

	return {
		subscribe: _mainStore.subscribe,
		status: {subscribe: _statusStore.subscribe},
		update,
	};
}
