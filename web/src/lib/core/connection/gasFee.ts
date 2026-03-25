import {writable, type Readable} from 'svelte/store';
import type {GetFeeHistoryReturnType, PublicClient} from 'viem';
import type {TypedDeployments} from './types';

export type GasPrice = {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint};
export type EstimateGasPriceResult = GasPrice[];

export type GasPriceEstimates = {
	slow: GasPrice;
	average: GasPrice;
	fast: GasPrice;
	higherThanExpected: boolean;
};

// New dual-store types
export type GasFeeValue =
	| {step: 'Unloaded'}
	| ({step: 'Loaded'} & GasPriceEstimates);

export type GasFeeStatus = {
	loading: boolean;
	error?: {message: string; cause?: any};
	lastSuccessfulFetch?: number;
};

export type GasFeeStore = {
	subscribe: Readable<GasFeeValue>['subscribe'];
	status: Readable<GasFeeStatus>;
	update(): void;
};

// Helper type for when loaded
export type LoadedGasFee = Extract<GasFeeValue, {step: 'Loaded'}>;

function defaultState(): GasFeeValue {
	return {step: 'Unloaded'};
}

function defaultStatus(): GasFeeStatus {
	return {loading: false};
}

function avg(arr: bigint[]) {
	const sum = arr.reduce((a: bigint, v: bigint) => a + v);
	return sum / BigInt(arr.length);
}

export function createGasFeeStore(
	params: {publicClient: PublicClient; deployments: TypedDeployments},
	options?: {fetchInterval?: number; expectedWorstGasPrice?: bigint},
): GasFeeStore {
	let feeHistoryNotSupported: boolean | undefined;
	const {publicClient, deployments} = params;
	const fetchInterval = options?.fetchInterval || 10 * 60 * 1000; // 10 minute

	// Main store - discriminated union
	let $state: GasFeeValue = defaultState();
	const _mainStore = writable<GasFeeValue>($state, start);

	// Status store - loading/error
	let $status: GasFeeStatus = defaultStatus();
	const _statusStore = writable<GasFeeStatus>($status);

	function setState(state: GasFeeValue) {
		$state = state;
		_mainStore.set($state);
	}

	function setStatus(status: GasFeeStatus) {
		$status = status;
		_statusStore.set($status);
	}

	async function fetchGasPriceEstimates(): Promise<GasPriceEstimates> {
		const blockCount = 20;
		const rewardPercentiles = [10, 50, 80];

		if (!feeHistoryNotSupported) {
			try {
				const feeHistory: GetFeeHistoryReturnType =
					await publicClient.getFeeHistory({
						blockCount,
						rewardPercentiles,
						blockTag: 'pending',
					});
				const reward = feeHistory.reward!;

				let blockNum = Number(feeHistory.oldestBlock);
				const lastBlock = blockNum + reward.length;
				let index = 0;
				const blocksHistory: {
					number: number;
					baseFeePerGas: bigint;
					gasUsedRatio: number;
					priorityFeePerGas: bigint[];
				}[] = [];
				while (blockNum < lastBlock) {
					blocksHistory.push({
						number: blockNum,
						baseFeePerGas: feeHistory.baseFeePerGas[index],
						gasUsedRatio: feeHistory.gasUsedRatio[index],
						priorityFeePerGas: reward[index],
					});
					blockNum += 1;
					index += 1;
				}

				const percentilePriorityFeeAverages: bigint[] = [];
				for (let i = 0; i < rewardPercentiles.length; i++) {
					percentilePriorityFeeAverages.push(
						avg(blocksHistory.map((b) => b.priorityFeePerGas[i])),
					);
				}

				const baseFeePerGas =
					feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1];

				const result: EstimateGasPriceResult = [];
				for (let i = 0; i < rewardPercentiles.length; i++) {
					result.push({
						maxFeePerGas: percentilePriorityFeeAverages[i] + baseFeePerGas,
						maxPriorityFeePerGas: percentilePriorityFeeAverages[i],
					});
				}
				return {
					slow: result[0],
					average: result[1],
					fast: result[2],
					higherThanExpected: options?.expectedWorstGasPrice
						? result[2].maxFeePerGas > options?.expectedWorstGasPrice
						: false,
				};
			} catch (err: any) {
				if (feeHistoryNotSupported === undefined) {
					if (
						('details' in err &&
							err.details.indexOf('unknown method eth_feeHistory') != -1) ||
						err.details.indexOf('Unknown method eth_feeHistory') != -1
					) {
						feeHistoryNotSupported = true;
					} else {
						throw err;
					}
				} else {
					throw err;
				}
			}
		}

		if (feeHistoryNotSupported) {
			const gasPrice = await publicClient.getGasPrice();
			return {
				slow: {
					maxFeePerGas: gasPrice,
					maxPriorityFeePerGas: gasPrice,
				},
				average: {
					maxFeePerGas: gasPrice,
					maxPriorityFeePerGas: gasPrice,
				},
				fast: {
					maxFeePerGas: gasPrice,
					maxPriorityFeePerGas: gasPrice,
				},
				higherThanExpected: options?.expectedWorstGasPrice
					? gasPrice > options?.expectedWorstGasPrice
					: false,
			};
		}

		throw new Error(`could not fallback on getGasPrice`);
	}

	async function fetchState(): Promise<boolean> {
		// Preserve lastSuccessfulFetch when setting loading state
		setStatus({
			loading: true,
			error: undefined,
			lastSuccessfulFetch: $status.lastSuccessfulFetch,
		});

		try {
			const gasPriceEstimates = await fetchGasPriceEstimates();
			setState({step: 'Loaded', ...gasPriceEstimates});
			// Set lastSuccessfulFetch on success
			setStatus({loading: false, lastSuccessfulFetch: Date.now()});
			return true;
		} catch (err: any) {
			console.error(`failed to fetch fee history`, err);
			// Preserve lastSuccessfulFetch on error
			setStatus({
				loading: false,
				error: {message: `failed to fetch fee history`, cause: err},
				lastSuccessfulFetch: $status.lastSuccessfulFetch,
			});
			return false;
		}
	}

	async function fetchContinuously() {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}

		let interval = fetchInterval;
		try {
			const success = await fetchState();
			if (!success) {
				interval = 500;
			}
		} finally {
			if (!timeout) {
				timeout = setTimeout(fetchContinuously, interval);
			}
		}
	}

	let timeout: NodeJS.Timeout | undefined;
	function start() {
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
