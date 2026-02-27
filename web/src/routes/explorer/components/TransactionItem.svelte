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
	import type {PublicClient, Transaction} from 'viem';
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
		goto(route(`/explorer/tx/${tx.hash}`));
	}

	// Get transaction type icon based on type
	let isEIP1559 = $derived(formatTransactionType(tx.type) === 'EIP-1559');
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
					<button
						type="button"
						class="font-mono text-sm font-medium text-primary hover:underline"
						onclick={viewTransaction}
					>
						{truncateTxHash(tx.hash)}
					</button>

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
					<div class="font-mono text-sm text-muted-foreground">
						Contract Creation
					</div>
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

				<!-- Type Icon -->
				{#if isEIP1559}
					<ZapIcon class="mx-auto mt-1 h-4 w-4 text-muted-foreground" />
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
