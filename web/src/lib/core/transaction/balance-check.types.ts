import type {PublicClient, Abi, ContractFunctionName, ContractFunctionArgs} from 'viem';
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

export interface ContractCallParams<
	TAbi extends Abi | readonly unknown[],
	TFunctionName extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>,
> {
	address: `0x${string}`;
	abi: TAbi;
	functionName: TFunctionName;
	args?: ContractFunctionArgs<TAbi, 'nonpayable' | 'payable', TFunctionName>;
	account: `0x${string}`;
	value?: bigint;
}

// Overload signatures
export interface EnsureCanAfford {
	// Contract call overload
	<
		const TAbi extends Abi | readonly unknown[],
		TFunctionName extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>,
	>(
		options: EnsureCanAffordBase & {
			contract: ContractCallParams<TAbi, TFunctionName>;
		},
	): Promise<ContractCallParams<TAbi, TFunctionName> & {chain: null}>;

	// Raw transaction overload
	(
		options: EnsureCanAffordBase & {
			transaction: RawTransactionParams;
		},
	): Promise<RawTransactionParams & {chain: null}>;
}
