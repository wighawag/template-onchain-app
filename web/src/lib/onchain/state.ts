import type {TypedDeployments} from '$lib/core/connection/types';
import {logs} from 'named-logs';
import {writable, type Readable} from 'svelte/store';
import type {PublicClient} from 'viem';

const logger = logs('onchain:state');

export type Message = {
	readonly account: `0x${string}`;
	readonly message: string;
	readonly timestamp: number;
};

// New types for dual-store architecture
export type OnchainStateValue =
	| {step: 'Unloaded'}
	| {step: 'Loaded'; messages: readonly Message[]};

export type OnchainStateStatus = {
	loading: boolean;
	error?: {message: string};
	lastSuccessfulFetch?: number;
};

export type OnchainStateStore = {
	subscribe: Readable<OnchainStateValue>['subscribe'];
	status: Readable<OnchainStateStatus>;
	update(): void;
};

function defaultState(): OnchainStateValue {
	return {step: 'Unloaded'};
}

function defaultStatus(): OnchainStateStatus {
	return {loading: false};
}

export function createOnchainState(params: {
	publicClient: PublicClient;
	deployments: TypedDeployments;
	config: {
		maxMessages: number;
	};
}): OnchainStateStore {
	const {publicClient, deployments, config} = params;

	// Main store - discriminated union with data
	let $state: OnchainStateValue = defaultState();
	const _mainStore = writable<OnchainStateValue>($state, start);

	// Status store - loading/error only
	let $status: OnchainStateStatus = defaultStatus();
	const _statusStore = writable<OnchainStateStatus>($status);

	function setState(state: OnchainStateValue) {
		$state = state;
		_mainStore.set($state);
	}

	function setStatus(status: OnchainStateStatus) {
		$status = status;
		_statusStore.set($status);
	}

	async function fetchState() {
		// Set loading=true, preserve lastSuccessfulFetch (only triggers status subscribers)
		setStatus({
			loading: true,
			error: undefined,
			lastSuccessfulFetch: $status.lastSuccessfulFetch,
		});

		try {
			// DEBUG failure cases:
			// await (() =>
			// 	new Promise((resolve, reject) => {
			// 		if ($state.step === 'Loaded' || Math.random() > 0.5) {
			// 			setTimeout(() => reject('Failed'), 1000);
			// 		} else {
			// 			setTimeout(resolve, 2000);
			// 		}
			// 		// if (Math.random() > 0.5) {
			// 		// 	setTimeout(() => reject('Failed'), 1000);
			// 		// } else {
			// 		// 	setTimeout(resolve, 45000);
			// 		// }
			// 	}))();

			// console.log(`fetching...`);
			const valueFromContracts = await publicClient.readContract({
				...deployments.contracts.GreetingsRegistry,
				functionName: 'getLastMessages',
				args: [BigInt(config.maxMessages)],
			});
			// console.log(`...fetched`);
			const messages = valueFromContracts.map((v) => ({
				...v,
				timestamp: Number(v.timestamp) * 1000,
			}));

			// Update main store with data (triggers main subscribers)
			setState({step: 'Loaded', messages});
			// Update status with new lastSuccessfulFetch timestamp (triggers status subscribers)
			setStatus({loading: false, lastSuccessfulFetch: Date.now()});
		} catch (err) {
			console.error(`failed to fetch`, err);
			// On error, preserve lastSuccessfulFetch
			setStatus({
				loading: false,
				error: {
					message:
						err instanceof Error ? err.message : 'Failed to fetch messages',
				},
				lastSuccessfulFetch: $status.lastSuccessfulFetch,
			});
		}
	}

	let started = false;
	let timeout: NodeJS.Timeout | undefined;

	async function fetchContinuously() {
		try {
			await fetchState();
		} catch (err) {
			console.error(`failed to fetch`, err);
		}
		if (timeout) {
			clearTimeout(timeout);
		}
		if (started) {
			timeout = setTimeout(fetchContinuously, 5000); // TODO config
		} else {
			timeout = undefined;
		}
	}

	function start() {
		started = true;
		fetchContinuously();
		return stop;
	}

	function stop() {
		started = false;
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
	}

	function update() {
		fetchState();
	}

	return {
		subscribe: _mainStore.subscribe,
		status: {subscribe: _statusStore.subscribe},
		update,
	};
}
