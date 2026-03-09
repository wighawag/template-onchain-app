import type {TypedDeployments} from '$lib/core/connection/types';
import {logs} from 'named-logs';
import {writable} from 'svelte/store';
import type {PublicClient} from 'viem';

const console = logs('onchain:state');

export type Message = {
	readonly account: `0x${string}`;
	readonly message: string;
	readonly timestamp: number;
};
export type OnchainState = readonly Message[];

function defaultState(): OnchainState {
	return [];
}

export function createOnchainState(params: {
	publicClient: PublicClient;
	deployments: TypedDeployments;
}) {
	const {publicClient, deployments} = params;
	let $state: OnchainState = defaultState();

	const _store = writable<OnchainState>($state, start);
	function set(state: OnchainState) {
		$state = state;
		_store.set($state);
		return $state;
	}

	async function fetchState() {
		const valueFromContracts = await publicClient.readContract({
			...deployments.contracts.GreetingsRegistry,
			functionName: 'getLastMessages',
			args: [10n],
		});
		const state = valueFromContracts.map((v) => ({
			...v,
			timestamp: Number(v.timestamp) * 1000,
		}));
		set(state);
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
		subscribe: _store.subscribe,
		update,
	};
}

export type OnchainStateStore = ReturnType<typeof createOnchainState>;
