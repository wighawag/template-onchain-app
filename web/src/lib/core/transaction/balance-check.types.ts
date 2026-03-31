import type {PublicClient, Abi} from 'viem';
import type {BalanceStore} from '$lib/core/connection/balance';
import type {GasFeeStore} from '$lib/core/connection/gasFee';

export type GasSpeed = 'slow' | 'average' | 'fast';

export interface EnsureCanAffordBase {
	publicClient: PublicClient;
	balance: BalanceStore;
	gasFee: GasFeeStore;
	gasSpeed?: GasSpeed;
	forceUpdate?: boolean;
}

export interface RawTransactionParams {
	to?: `0x${string}`;
	data?: `0x${string}`;
	value?: bigint;
	account: `0x${string}`;
}

// Minimal constraint for contract call params - any object with address, abi, functionName, account
export interface ContractCallParamsMinimal {
	address: `0x${string}`;
	abi: Abi | readonly unknown[];
	functionName: string;
	account: `0x${string}`;
}

// Overload signatures
export interface EnsureCanAfford {
	// Contract call overload - preserves exact input type
	<const TContract extends ContractCallParamsMinimal>(
		options: EnsureCanAffordBase & {
			contract: TContract;
		},
	): Promise<TContract>;

	// Raw transaction overload
	(
		options: EnsureCanAffordBase & {
			transaction: RawTransactionParams;
		},
	): Promise<RawTransactionParams>;
}
