import type {Abi, Transaction, TransactionReceipt, PublicClient} from 'viem';
import {decodeFunctionData} from 'viem';
import deploymentsFromFiles from '$lib/deployments';

/**
 * Contract info for decoding
 */
export interface ContractInfo {
	name: string;
	address: string;
	abi: Abi;
}

/**
 * Decoded transaction data structure
 */
export interface DecodedTransactionData {
	functionName?: string;
	contractName?: string;
	args?: Record<string, unknown> | unknown[];
	isDecoded: boolean;
	status: 'success' | 'failed' | 'pending';
	error?: string;
}

/**
 * Format options for decoded transaction display
 */
export interface FormattedDecodedTransaction {
	methodLabel: string;
	methodDetails?: string;
	statusText: string;
}

/**
 * Find contract in deployments by address
 */
function findContractByAddress(address: `0x${string}`): ContractInfo | null {
	const contracts = deploymentsFromFiles.contracts;
	for (const [name, contract] of Object.entries(contracts)) {
		if (contract.address.toLowerCase() === address.toLowerCase()) {
			return {
				name,
				address: contract.address,
				abi: contract.abi as Abi,
			};
		}
	}
	return null;
}

/**
 * Decode transaction function call data using ABI
 */
function decodeFunctionCall(tx: Transaction, abi: Abi): {
	functionName?: string;
	args?: Record<string, unknown> | unknown[];
} | null {
	try {
		// Try to decode the function call
		const decoded = decodeFunctionData({
			abi,
			data: tx.input,
		});

		return {
			functionName: decoded.functionName,
			args: decoded.args ? JSON.parse(JSON.stringify(decoded.args)) : undefined,
		};
	} catch (e) {
		// Decoding failed
		return null;
	}
}

/**
 * Get transaction status from receipt
 */
function getTransactionStatus(
	receipt: TransactionReceipt | null,
): 'success' | 'failed' | 'pending' {
	if (!receipt) {
		return 'pending';
	}
	return receipt.status === 'success' ? 'success' : 'failed';
}

/**
 * Main function to decode a transaction
 * @param tx - The transaction object
 * @param receipt - The transaction receipt (can be null for pending transactions)
 * @param publicClient - The viem public client
 * @returns Decoded transaction data
 */
export async function decodeTransaction(
	tx: Transaction,
	receipt: TransactionReceipt | null,
	publicClient: PublicClient,
): Promise<DecodedTransactionData> {
	const status = getTransactionStatus(receipt);

	// If no recipient, it's a contract creation
	if (!tx.to) {
		return {
			isDecoded: false,
			status,
			functionName: 'Contract Creation',
		};
	}

	// Try to find contract by address
	const contractInfo = findContractByAddress(tx.to);

	// If it's a simple transfer (no function data or no contract found)
	if (!contractInfo || tx.input === '0x' || tx.input === '0x0') {
		return {
			isDecoded: false,
			status,
		};
	}

	// Try to decode the function call
	const decodedCall = decodeFunctionCall(tx, contractInfo.abi);

	if (decodedCall && decodedCall.functionName) {
		return {
			functionName: decodedCall.functionName,
			contractName: contractInfo.name,
			args: decodedCall.args,
			isDecoded: true,
			status,
		};
	}

	// Contract call but couldn't decode
	return {
		isDecoded: false,
		status,
	};
}

/**
 * Format decoded transaction for display
 * @param data - The decoded transaction data
 * @returns Formatted data for UI display
 */
export function formatDecodedTransaction(
	data: DecodedTransactionData,
): FormattedDecodedTransaction {
	let methodLabel = 'Contract Call';
	let methodDetails: string | undefined;

	if (data.isDecoded && data.functionName) {
		if (data.contractName) {
			methodLabel = `${data.contractName}.${data.functionName}`;
		} else {
			methodLabel = data.functionName;
		}

		if (data.args) {
			methodDetails = formatDecodedArgs(data.args);
		}
	} else if (!data.functionName) {
		methodLabel = 'ETH Transfer';
	} else if (data.functionName === 'Contract Creation') {
		methodLabel = 'Contract Creation';
	}

	return {
		methodLabel,
		methodDetails,
		statusText: data.status === 'success' ? 'Success' : data.status === 'failed' ? 'Failed' : 'Pending',
	};
}

/**
 * Format decoded function arguments for display
 * @param args - The decoded arguments
 * @returns Formatted string representation
 */
export function formatDecodedArgs(args: Record<string, unknown> | unknown[]): string {
	if (!args) {
		return '';
	}

	// If array (positional args)
	if (Array.isArray(args)) {
		if (args.length === 0) {
			return '()';
		}
		return `(${args.map((arg) => formatArgValue(arg)).join(', ')})`;
	}

	// If object (named args)
	const entries = Object.entries(args);
	if (entries.length === 0) {
		return '()';
	}

	return `(${entries.map(([key, value]) => `${key}: ${formatArgValue(value)}`).join(', ')})`;
}

/**
 * Format a single argument value for display
 * @param value - The argument value
 * @returns Formatted string representation
 */
function formatArgValue(value: unknown): string {
	if (value === null) {
		return 'null';
	}
	if (value === undefined) {
		return 'undefined';
	}
	if (typeof value === 'string') {
		// Check if it's an address
		if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
			return `${value.slice(0, 6)}...${value.slice(-4)}`;
		}
		// Check if it's a hash
		if (/^0x[a-fA-F0-9]{64}$/.test(value)) {
			return `${value.slice(0, 8)}...`;
		}
		// Regular string - truncate if too long
		if (value.length > 50) {
			return `"${value.slice(0, 30)}..."`;
		}
		return `"${value}"`;
	}
	if (typeof value === 'bigint') {
		return `${value.toString()}n`;
	}
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value);
		} catch {
			return '[Object]';
		}
	}
	return String(value);
}