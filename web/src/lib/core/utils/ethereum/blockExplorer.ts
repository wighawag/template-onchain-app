import deploymentsFromFiles from '$lib/deployments';

/**
 * Get the block explorer URL for a transaction hash
 * Returns null if no block explorer is configured
 */
export function getBlockExplorerTxUrl(hash: string): string | null {
	const blockExplorers = (deploymentsFromFiles.chain as any).blockExplorers;
	if (!blockExplorers?.default?.url) return null;
	return `${blockExplorers.default.url}/tx/${hash}`;
}

/**
 * Get the block explorer URL for an address
 * Returns null if no block explorer is configured
 */
export function getBlockExplorerAddressUrl(address: string): string | null {
	const blockExplorers = (deploymentsFromFiles.chain as any).blockExplorers;
	if (!blockExplorers?.default?.url) return null;
	return `${blockExplorers.default.url}/address/${address}`;
}

/**
 * Get the block explorer name if configured
 */
export function getBlockExplorerName(): string | null {
	const blockExplorers = (deploymentsFromFiles.chain as any).blockExplorers;
	return blockExplorers?.default?.name ?? null;
}

/**
 * Check if a block explorer is configured
 */
export function hasBlockExplorer(): boolean {
	const blockExplorers = (deploymentsFromFiles.chain as any).blockExplorers;
	return !!blockExplorers?.default?.url;
}
