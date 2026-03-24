<script lang="ts">
	import {goto} from '$app/navigation';
	import * as Card from '$lib/shadcn/ui/card';
	import {
		CheckCircleIcon,
		XCircleIcon,
		LoaderIcon,
		FileTextIcon,
		ZapIcon,
	} from '@lucide/svelte';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import TransactionHash from '$lib/core/ui/ethereum/TransactionHash.svelte';
	import type {PublicClient, Transaction, TransactionReceipt} from 'viem';
	import {formatGwei} from 'viem';
	import {
		decodeTransaction,
		formatDecodedTransaction,
		type DecodedTransactionData,
	} from '../lib/services/transactionDecoder';
	import {
		formatTransactionType,
		formatTimestamp,
		formatValue,
		truncateTxHash,
	} from '../lib/utils';
	import {route} from '$lib';

	interface Props {
		tx: Transaction;
		blockTimestamp: number;
		publicClient: PublicClient;
	}

	let {tx, blockTimestamp, publicClient}: Props = $props();

	let decodedData = $state<DecodedTransactionData>({
		isDecoded: false,
		status: 'pending',
	});
	let formattedData = $derived(formatDecodedTransaction(decodedData));
	let loading = $state(true);
	let receipt = $state<TransactionReceipt | null>(null);

	// Track the hash we've decoded to prevent re-decoding
	let decodedHash = $state<string | null>(null);

	// Decode transaction on mount or when tx.hash changes
	async function decodeTransactionData(hash: `0x${string}`) {
		loading = true;
		try {
			// Fetch receipt for status
			let txReceipt = null;
			try {
				txReceipt = await publicClient.getTransactionReceipt({hash});
				receipt = txReceipt;
			} catch (e) {
				// Transaction might be pending
			}

			const decoded = await decodeTransaction(tx, txReceipt, publicClient);
			decodedData = decoded;
			decodedHash = hash;
		} catch (e) {
			console.error('Error decoding transaction:', e);
		} finally {
			loading = false;
		}
	}

	// Only decode when tx.hash changes and we haven't decoded it yet
	$effect(() => {
		const hash = tx.hash;
		if (hash && hash !== decodedHash) {
			decodeTransactionData(hash);
		}
	});

	// Navigate to transaction details page
	function viewTransaction() {
		goto(route(`/explorer/tx/${tx.hash}`));
	}

	// Navigate to address page
	function viewAddress(address: string, event: MouseEvent) {
		event.stopPropagation();
		goto(route(`/explorer/address/${address}`));
	}

	// Get transaction type icon based on type
	let isEIP1559 = $derived(tx.type === 'eip1559');

	// Check if this is a contract creation transaction
	let isContractCreation = $derived(!tx.to);

	// Get contract address from receipt for contract creation transactions
	let contractAddress = $derived(
		isContractCreation && receipt?.contractAddress
			? receipt.contractAddress
			: null,
	);

	// Format EIP-1559 fee info
	let maxPriorityFeePerGas = $derived(
		isEIP1559 && 'maxPriorityFeePerGas' in tx
			? (tx.maxPriorityFeePerGas as bigint)
			: null,
	);
	let maxFeePerGas = $derived(
		isEIP1559 && 'maxFeePerGas' in tx ? (tx.maxFeePerGas as bigint) : null,
	);
	let effectiveGasPrice = $derived(receipt?.effectiveGasPrice ?? null);

	// Calculate the actual base fee used (effectiveGasPrice - priorityFeePerGas)
	// Note: The actual priority fee paid is min(maxPriorityFeePerGas, maxFeePerGas - baseFee)
	let baseFeeUsed = $derived(
		effectiveGasPrice && maxPriorityFeePerGas
			? effectiveGasPrice - maxPriorityFeePerGas
			: null,
	);
</script>

<Card.Root
	class="cursor-pointer transition-colors hover:border-primary/50"
	onclick={viewTransaction}
>
	<Card.Content class="p-4">
		<div class="flex items-start justify-between gap-4">
			<!-- Left side: Transaction info -->
			<div class="min-w-0 flex-1 space-y-2">
				<!-- Transaction Hash and Status -->
				<div class="flex flex-wrap items-center gap-2">
					<TransactionHash
						value={tx.hash}
						linkTo="internal"
						size="sm"
						showCopy={false}
					/>

					<!-- Status Indicator -->
					<div class="flex items-center gap-1">
						{#if loading}
							<LoaderIcon class="h-4 w-4 animate-spin text-muted-foreground" />
						{:else if decodedData.status === 'success'}
							<CheckCircleIcon class="h-4 w-4 text-green-600" />
						{:else if decodedData.status === 'failed'}
							<XCircleIcon class="h-4 w-4 text-red-600" />
						{:else}
							<LoaderIcon class="h-4 w-4 animate-spin text-yellow-600" />
						{/if}
						<span class="text-xs text-muted-foreground"
							>{formattedData.statusText}</span
						>
					</div>
				</div>

				<!-- Method/Function Name -->
				{#if decodedData.isDecoded && decodedData.functionName}
					<div>
						<div class="text-sm font-medium">{formattedData.methodLabel}</div>
						{#if formattedData.methodDetails}
							<div
								class="truncate text-xs text-muted-foreground"
								title={formattedData.methodDetails}
							>
								{formattedData.methodDetails}
							</div>
						{/if}
					</div>
				{:else if tx.to}
					<div class="font-mono text-sm text-muted-foreground">
						Contract Call
					</div>
				{:else}
					<div class="space-y-1">
						<div class="font-mono text-sm text-muted-foreground">
							Contract Creation d
						</div>
						{#if contractAddress}
							<div class="flex items-center gap-1 text-xs">
								<span class="text-muted-foreground">Created:</span>
								<Address
									value={contractAddress}
									linkTo="internal"
									showCopy={false}
								/>
							</div>
						{:else if loading}
							<div
								class="flex items-center gap-1 text-xs text-muted-foreground"
							>
								<LoaderIcon class="h-3 w-3 animate-spin" />
								<span>Loading contract address...</span>
							</div>
						{/if}
					</div>
				{/if}

				<!-- From/To Addresses -->
				<div class="flex flex-wrap items-center gap-3 text-xs">
					<div class="flex items-center gap-1">
						<span class="text-muted-foreground">From:</span>
						<Address value={tx.from} linkTo="internal" size="xs" />
					</div>
					{#if tx.to}
						<div class="flex items-center gap-1">
							<span class="text-muted-foreground">To:</span>
							<Address value={tx.to} linkTo="internal" size="xs" />
						</div>
					{/if}
				</div>
			</div>

			<!-- Right side: Block info and value -->
			<div class="shrink-0 space-y-2 text-right">
				<!-- Block Number -->
				<div>
					<div class="text-xs text-muted-foreground">Block</div>
					<div class="font-mono text-sm">{Number(tx.blockNumber)}</div>
				</div>

				<!-- Value -->
				{#if tx.value > 0n}
					<div>
						<div class="text-xs text-muted-foreground">Value</div>
						<div class="font-mono text-sm font-medium">
							{formatValue(tx.value)}
						</div>
					</div>
				{/if}

				<!-- Type and Fee Info -->
				{#if isEIP1559}
					<div class="space-y-1">
						<div class="flex items-center justify-end gap-1">
							<ZapIcon class="h-4 w-4 text-muted-foreground" />
							<span class="text-xs text-muted-foreground">EIP-1559</span>
						</div>
						{#if baseFeeUsed !== null}
							<div>
								<div class="text-xs text-muted-foreground">Base Fee</div>
								<div class="font-mono text-xs">
									{formatGwei(baseFeeUsed)} Gwei
								</div>
							</div>
						{/if}
						{#if maxPriorityFeePerGas !== null}
							<div>
								<div class="text-xs text-muted-foreground">Priority Fee</div>
								<div class="font-mono text-xs">
									{formatGwei(maxPriorityFeePerGas)} Gwei
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<FileTextIcon class="mx-auto mt-1 h-4 w-4 text-muted-foreground" />
				{/if}
			</div>
		</div>

		<!-- Timestamp -->
		<div class="mt-3 border-t pt-3">
			<div class="text-xs text-muted-foreground">
				{formatTimestamp(blockTimestamp)}
			</div>
		</div>
	</Card.Content>
</Card.Root>
