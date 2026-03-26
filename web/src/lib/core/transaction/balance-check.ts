import {get} from 'svelte/store';
import type {PublicClient} from 'viem';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';
import {balanceCheckStore} from './balance-check-store';
import {InsufficientFundsError} from './InsufficientFundsError';
import type {
	EnsureCanAfford,
	EnsureCanAffordBase,
	GasSpeed,
	RawTransactionParams,
} from './balance-check.types';

function getGasPrice(gasFee: GasFeeStore, speed: GasSpeed): bigint {
	const gasFeeValue = get(gasFee);
	if (gasFeeValue.step !== 'Loaded') {
		throw new Error('Gas fee not loaded');
	}
	return gasFeeValue[speed].maxFeePerGas;
}

async function estimateContractGas(
	publicClient: PublicClient,
	params: {
		address: `0x${string}`;
		abi: any;
		functionName: string;
		args?: any[];
		account: `0x${string}`;
		value?: bigint;
	},
): Promise<bigint> {
	return publicClient.estimateContractGas({
		address: params.address,
		abi: params.abi,
		functionName: params.functionName,
		args: params.args,
		account: params.account,
		value: params.value,
	});
}

async function estimateRawGas(
	publicClient: PublicClient,
	params: RawTransactionParams,
): Promise<bigint> {
	return publicClient.estimateGas({
		to: params.to,
		data: params.data,
		value: params.value,
		account: params.account,
	});
}

async function checkBalanceAndShowModal(
	balance: BalanceStore,
	estimatedCost: bigint,
): Promise<void> {
	// Ensure balance is loaded
	const balanceValue = get(balance);
	if (balanceValue.step !== 'Loaded') {
		await balance.update();
	}

	const currentBalance = get(balance);
	if (currentBalance.step !== 'Loaded') {
		throw new Error('Could not load balance');
	}

	if (currentBalance.value >= estimatedCost) {
		// Sufficient funds - close modal and proceed
		balanceCheckStore.close();
		return;
	}

	// Insufficient funds - show modal and wait for dismissal
	return new Promise((_, reject) => {
		balanceCheckStore.showInsufficientFunds({
			balance: currentBalance.value,
			estimatedCost,
			shortfall: estimatedCost - currentBalance.value,
			onDismiss: () => {
				balanceCheckStore.close();
				reject(new InsufficientFundsError(currentBalance.value, estimatedCost));
			},
		});
	});
}

export const ensureCanAfford: EnsureCanAfford = async (options: any) => {
	const {
		publicClient,
		balance,
		gasFee,
		gasSpeed = 'fast',
		forceUpdate = false,
	} = options as EnsureCanAffordBase;

	// Step 1: Show estimating modal
	balanceCheckStore.startEstimating();

	try {
		// Step 2: Force update balance and gas fee if requested
		if (forceUpdate) {
			await Promise.all([balance.update(), gasFee.update()]);
		}

		// Step 3: Get gas price
		const gasPrice = getGasPrice(gasFee, gasSpeed);

		// Step 4: Estimate gas based on transaction type
		let gasEstimate: bigint;
		let value: bigint = 0n;

		if ('contract' in options) {
			const {contract} = options;
			gasEstimate = await estimateContractGas(publicClient, contract);
			value = contract.value ?? 0n;
		} else {
			const {transaction} = options;
			gasEstimate = await estimateRawGas(publicClient, transaction);
			value = transaction.value ?? 0n;
		}

		// Step 5: Calculate total cost
		const gasCost = gasEstimate * gasPrice;
		const estimatedCost = gasCost + value;

		// Step 6: Check balance and handle insufficient funds
		await checkBalanceAndShowModal(balance, estimatedCost);

		// Step 7: Return the params for use with writeContract/sendTransaction
		if ('contract' in options) {
			return {...options.contract, chain: null};
		} else {
			return {...options.transaction, chain: null};
		}
	} catch (error) {
		balanceCheckStore.close();
		throw error;
	}
};
