<script lang="ts">
	import {goto} from '$app/navigation';
	import * as Card from '$lib/shadcn/ui/card';
	import {CheckCircleIcon, XCircleIcon, LoaderIcon, FileTextIcon, ZapIcon} from '@lucide/svelte';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import type {PublicClient, Transaction} from 'viem';
	import {
		decodeTransaction,
		formatDecodedTransaction,
		type DecodedTransactionData,
	} from '$lib/services/transactionDecoder';
	import {formatTransactionType, formatTimestamp, formatValue, truncateTxHash} from '../lib/utils';

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

	// Decode transaction on mount
	async function decodeTransactionData() {
		loading = true;
		try {
			// Fetch receipt for status
			let receipt = null;
			try {
				receipt = await publicClient.getTransactionReceipt({hash: tx.hash});
			} catch (e) {
				// Transaction might be pending
			}

			const decoded = await decodeTransaction(tx, receipt, publicClient);
			decodedData = decoded;
		} catch (e) {
			console.error('Error decoding transaction:', e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		decodeTransactionData();
	});

	// Navigate to transaction details page
	function viewTransaction() {
		goto(`/explorer/tx/${tx.hash}`);
	}

	// Get transaction type icon based on type
	let isEIP1559 = $derived(formatTransactionType(tx.type) === 'EIP-1559');
</script>

<Card.Root class="hover:border-primary/50 transition-colors cursor-pointer" onclick={viewTransaction}>
	<Card.Content class="p-4">
		<div class="flex items-start justify-between gap-4">
			<!-- Left side: Transaction info -->
			<div class="flex-1 min-w-0 space-y-2">
				<!-- Transaction Hash and Status -->
				<div class="flex items-center gap-2 flex-wrap">
					<button type="button" class="font-mono text-sm font-medium text-primary hover:underline" onclick={viewTransaction}>
						{truncateTxHash(tx.hash)}
					</button>

					<!-- Status Indicator -->
					<div class="flex items-center gap-1">
						{#if loading}
							<LoaderIcon class="h-4 w-4 text-muted-foreground animate-spin" />
						{:else if decodedData.status === 'success'}
							<CheckCircleIcon class="h-4 w-4 text-green-600" />
						{:else if decodedData.status === 'failed'}
							<XCircleIcon class="h-4 w-4 text-red-600" />
						{:else}
							<LoaderIcon class="h-4 w-4 text-yellow-600 animate-spin" />
						{/if}
						<span class="text-xs text-muted-foreground">{formattedData.statusText}</span>
					</div>
				</div>

				<!-- Method/Function Name -->
				{#if decodedData.isDecoded && decodedData.functionName}
					<div>
						<div class="font-medium text-sm">{formattedData.methodLabel}</div>
						{#if formattedData.methodDetails}
							<div class="text-xs text-muted-foreground truncate" title={formattedData.methodDetails}>
								{formattedData.methodDetails}
							</div>
						{/if}
					</div>
				{:else if tx.to}
					<div class="font-mono text-sm text-muted-foreground">Contract Call</div>
				{:else}
					<div class="font-mono text-sm text-muted-foreground">Contract Creation</div>
				{/if}

				<!-- From/To Addresses -->
				<div class="flex items-center gap-3 text-xs">
					<div class="flex items-center gap-1">
						<span class="text-muted-foreground">From:</span>
						<Address value={tx.from} />
					</div>
					{#if tx.to}
						<div class="flex items-center gap-1">
							<span class="text-muted-foreground">To:</span>
							<Address value={tx.to} />
						</div>
					{/if}
				</div>
			</div>

			<!-- Right side: Block info and value -->
			<div class="text-right space-y-2 shrink-0">
				<!-- Block Number -->
				<div>
					<div class="text-xs text-muted-foreground">Block</div>
					<div class="font-mono text-sm">{Number(tx.blockNumber)}</div>
				</div>

				<!-- Value -->
				{#if tx.value > 0n}
					<div>
						<div class="text-xs text-muted-foreground">Value</div>
						<div class="font-mono text-sm font-medium">{formatValue(tx.value)}</div>
					</div>
				{/if}

				<!-- Type Icon -->
				{#if isEIP1559}
					<ZapIcon class="h-4 w-4 text-muted-foreground mx-auto mt-1" />
				{:else}
					<FileTextIcon class="h-4 w-4 text-muted-foreground mx-auto mt-1" />
				{/if}
			</div>
		</div>

		<!-- Timestamp -->
		<div class="mt-3 pt-3 border-t">
			<div class="text-xs text-muted-foreground">{formatTimestamp(blockTimestamp)}</div>
		</div>
	</Card.Content>
</Card.Root>