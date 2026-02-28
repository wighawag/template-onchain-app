import type {Abi, Address, Log} from 'viem';
import deploymentsFromFiles from '$lib/deployments';
import {decodeEventLog, formatEther, formatGwei} from 'viem';

export interface ContractInfo {
	name: string;
	address: string;
	abi: Abi;
}

export interface DecodedEvent {
	eventName: string;
	signature: string;
	args: Record<string, unknown> | unknown[];
	address: Address;
	blockNumber: bigint;
	txHash: string;
}

/**
 * Find contract in deployments by address
 */
export function findContractByAddress(address: Address): ContractInfo | null {
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
 * Decode a single log using ABI
 */
function decodeLogWithAbi(log: Log, abi: Abi): DecodedEvent | null {
	try {
		// Try to decode the log
		const decoded = decodeEventLog({
			abi,
			data: log.data,
			topics: log.topics as any,
		});

		return {
			eventName: decoded.eventName ?? 'Unknown Event',
			signature: log.topics[0] ?? '0x0',
			args: JSON.parse(JSON.stringify(decoded.args ?? {})),
			address: log.address,
			blockNumber: log.blockNumber ?? 0n,
			txHash: log.transactionHash ?? '0x0',
		};
	} catch (e) {
		// Decoding failed, return null
		return null;
	}
}

/**
 * Decode logs using deployments.ts data
 */
export function decodeLogs(logs: Log[]): DecodedEvent[] {
	const decodedEvents: DecodedEvent[] = [];

	for (const log of logs) {
		const contractInfo = findContractByAddress(log.address);
		if (contractInfo) {
			const decoded = decodeLogWithAbi(log, contractInfo.abi);
			if (decoded) {
				decodedEvents.push(decoded);
			}
		}
	}

	return decodedEvents;
}

/**
 * Format gas values to human-readable format
 */
export function formatGas(gas: bigint): string {
	return gas.toLocaleString();
}

/**
 * Format gas price to Gwei
 */
export function formatGasPrice(gasPrice: bigint): string {
	return `${formatGwei(gasPrice)} Gwei`;
}

/**
 * Format value to ETH
 */
export function formatValue(value: bigint): string {
	return `${formatEther(value)} ETH`;
}

/**
 * Format transaction status
 */
export function formatTxStatus(status: 'success' | 'reverted'): string {
	return status === 'success' ? 'Success' : 'Failed';
}

/**
 * Check if address is a contract (has code)
 */
export function isContract(code: `0x${string}`): boolean {
	return code !== '0x' && code.length > 2;
}

/**
 * Format bytecode for display
 */
export function formatBytecode(
	code: `0x${string}`,
	maxLength: number = 200,
): string {
	if (code.length <= maxLength) {
		return code;
	}
	return `${code.slice(0, maxLength)}... (${code.length} bytes)`;
}

/**
 * Get all unique addresses from logs
 */
export function getLogAddresses(logs: Log[]): Address[] {
	const addresses = new Set<Address>();
	for (const log of logs) {
		addresses.add(log.address);
	}
	return Array.from(addresses);
}

/**
 * Format transaction type for display
 */
export function formatTransactionType(type: string): string {
	const typeMap: Record<string, string> = {
		'0x0': 'Legacy',
		'0x1': 'EIP-2930',
		'0x2': 'EIP-1559',
	};
	return typeMap[type] || type;
}

/**
 * Truncate transaction hash for display
 */
export function truncateTxHash(hash: string, length: number = 10): string {
	if (hash.length <= length) {
		return hash;
	}
	return `${hash.slice(0, length)}...${hash.slice(-4)}`;
}

/**
 * Get transaction type icon component name
 */
export function getTransactionTypeIcon(type: string): string {
	if (type === '0x2' || type === 'EIP-1559') {
		return 'ZapIcon';
	}
	return 'FileTextIcon';
}

/**
 * Format timestamp to readable date/time (relative)
 */
export function formatTimestamp(timestamp: number): string {
	if (!timestamp) {
		return 'Unknown';
	}

	const date = new Date(timestamp * 1000);
	const now = new Date();
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	// If less than a minute ago
	if (diffInSeconds < 60) {
		return 'Just now';
	}

	// If less than an hour ago
	if (diffInSeconds < 3600) {
		const minutes = Math.floor(diffInSeconds / 60);
		return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
	}

	// If less than a day ago
	if (diffInSeconds < 86400) {
		const hours = Math.floor(diffInSeconds / 3600);
		return `${hours} hour${hours > 1 ? 's' : ''} ago`;
	}

	// If less than a week ago
	if (diffInSeconds < 604800) {
		const days = Math.floor(diffInSeconds / 86400);
		return `${days} day${days > 1 ? 's' : ''} ago`;
	}

	// Otherwise, return the full date
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

/**
 * Format timestamp to precise date and time
 * Returns full date with time in local timezone
 */
export function formatPreciseTimestamp(timestamp: number): string {
	if (!timestamp) {
		return 'Unknown';
	}

	const date = new Date(timestamp * 1000);

	return date.toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZoneName: 'short',
	});
}
