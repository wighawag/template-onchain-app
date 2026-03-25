import type {OptionalSigner, Signer} from '$lib/core/connection/types';
import {get, writable, type Readable} from 'svelte/store';
import type {PublicClient} from 'viem';

// New dual-store types
export type SignerBalanceValue =
	| {step: 'Unloaded'}
	| {step: 'Loaded'; signer: bigint; owner: bigint};

export type SignerBalanceStatus = {
	loading: boolean;
	error?: {message: string};
	lastSuccessfulFetch?: number;
};

export type SignerBalanceStore = {
	subscribe: Readable<SignerBalanceValue>['subscribe'];
	status: Readable<SignerBalanceStatus>;
	update(): void;
};

function defaultState(): SignerBalanceValue {
	return {step: 'Unloaded'};
}

function defaultStatus(): SignerBalanceStatus {
	return {loading: false};
}

export function createSignerBalanceStore(
	params: {
		publicClient: PublicClient;
		signer: Readable<OptionalSigner>;
	},
	options?: {
		fetchInterval?: number;
	},
): SignerBalanceStore {
	const {publicClient, signer} = params;
	const fetchInterval = options?.fetchInterval || 5 * 1000; // 5 seconds

	// Main store - discriminated union
	let $state: SignerBalanceValue = defaultState();
	let $signer = get(signer);
	const _mainStore = writable<SignerBalanceValue>($state, start);

	// Status store - loading/error
	let $status: SignerBalanceStatus = defaultStatus();
	const _statusStore = writable<SignerBalanceStatus>($status);

	function setState(state: SignerBalanceValue) {
		$state = state;
		_mainStore.set($state);
	}

	function setStatus(status: SignerBalanceStatus) {
		$status = status;
		_statusStore.set($status);
	}

	async function fetchState($signer: Signer): Promise<boolean> {
		// Preserve lastSuccessfulFetch when setting loading state
		setStatus({
			loading: true,
			error: undefined,
			lastSuccessfulFetch: $status.lastSuccessfulFetch,
		});

		let signerBalance: bigint;
		try {
			signerBalance = await publicClient.getBalance({address: $signer.address});
		} catch (err) {
			// Preserve lastSuccessfulFetch on error
			setStatus({
				loading: false,
				error: {message: `failed to fetch balance for ${$signer.address}`},
				lastSuccessfulFetch: $status.lastSuccessfulFetch,
			});
			return false;
		}

		let ownerBalance: bigint;
		try {
			ownerBalance = await publicClient.getBalance({address: $signer.owner});
		} catch (err) {
			// Preserve lastSuccessfulFetch on error
			setStatus({
				loading: false,
				error: {message: `failed to fetch balance for ${$signer.owner}`},
				lastSuccessfulFetch: $status.lastSuccessfulFetch,
			});
			return false;
		}

		setState({
			step: 'Loaded',
			signer: signerBalance,
			owner: ownerBalance,
		});
		// Set lastSuccessfulFetch on success
		setStatus({loading: false, lastSuccessfulFetch: Date.now()});
		return true;
	}

	async function fetchContinuously() {
		if (!$signer) {
			setState({step: 'Unloaded'});
			setStatus({loading: false});
		}
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if ($signer) {
			await fetchNow($signer);
		}
	}

	async function fetchNow(signer: Signer) {
		let interval = fetchInterval;
		try {
			const success = await fetchState(signer);
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
		unsubscribeFromAccount = signer.subscribe(async (newSigner) => {
			const signerChanged = $signer?.address != newSigner?.address;

			if (signerChanged) {
				if (newSigner) {
					$signer = {...newSigner};
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
