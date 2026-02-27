<script lang="ts">
	import {page} from '$app/stores';
	import DefaultHead from '../../../metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {getUserContext} from '$lib';
	import * as Card from '$lib/shadcn/ui/card';
	import * as Alert from '$lib/shadcn/ui/alert';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Empty from '$lib/shadcn/ui/empty';
	import {ArrowLeftIcon, CheckCircleIcon, XCircleIcon, FileCodeIcon, HashIcon} from '@lucide/svelte';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import type {PublicClient} from 'viem';
	import {
		decodeLogs,
		formatGas,
		formatGasPrice,
		formatValue,
		formatTxStatus,
		findContractByAddress,
	} from '../../lib/utils';

	let dependencies = getUserContext();
	let {publicClient, connection} = $derived(dependencies);

	const txHash = $derived($page.params.hash as `0x${string}`);

	let tx = $state<Awaited<ReturnType<PublicClient['getTransaction']>> | null>(null);
	let receipt = $state<Awaited<ReturnType<PublicClient['getTransactionReceipt']>> | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let decodedEvents = $state<Array<{
		eventName: string;
		signature: string;
		args: Record<string, unknown> | unknown[];
		address: `0x${string}`;
		blockNumber: bigint;
		txHash: string;
	}>>([]);

	async function fetchTransaction() {
		if (!publicClient) {
			error = 'Public client not available';
			loading = false;
			return;
		}

		loading = true;
		error = null;

		try {
			// Fetch transaction
			const transaction = await publicClient.getTransaction({hash: txHash});
			tx = transaction;

			// Fetch receipt
			const txReceipt = await publicClient.getTransactionReceipt({hash: txHash});
			receipt = txReceipt;

			// Decode events
			if (txReceipt.logs.length > 0) {
				decodedEvents = decodeLogs(txReceipt.logs);
			}
		} catch (e: any) {
			error = e.message || 'Failed to fetch transaction';
			console.error('Error fetching transaction:', e);
		} finally {
			loading = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchTransaction();
	});
</script>

<DefaultHead title={'Transaction Explorer'} />

<ConnectionFlow {connection} />

<div class="container mx-auto max-w-5xl px-4 py-8">
	{#if loading}
		<div class="flex flex-col items-center justify-center py-20">
			<Spinner />
			<p class="mt-4 text-muted-foreground">Loading transaction...</p>
		</div>
	{:else if error}
		<Alert.Root variant="destructive">
			<XCircleIcon class="h-4 w-4" />
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{:else if !tx || !receipt}
		<Empty.Root class="min-h-[400px]">
			<Empty.Header>
				<Empty.Media variant="icon">
					<HashIcon />
				</Empty.Media>
				<Empty.Title>Transaction Not Found</Empty.Title>
				<Empty.Description>
					The transaction hash {txHash} could not be found on the blockchain.
				</Empty.Description>
			</Empty.Header>
			<Button onclick={() => window.history.back()} variant="outline">
				<ArrowLeftIcon class="mr-2 h-4 w-4" />
				Go Back
			</Button>
		</Empty.Root>
	{:else}
		<div class="space-y-6">
			<!-- Header -->
			<div class="flex items-center justify-between">
				<div>
					<div class="flex items-center gap-2">
						<h1 class="text-2xl font-bold">Transaction Details</h1>
						{#if receipt.status === 'success'}
							<div class="flex items-center gap-1 text-sm text-green-600">
								<CheckCircleIcon class="h-4 w-4" />
								<span>Success</span>
							</div>
						{:else}
							<div class="flex items-center gap-1 text-sm text-red-600">
								<XCircleIcon class="h-4 w-4" />
								<span>Failed</span>
							</div>
						{/if}
					</div>
					<div class="flex items-center gap-2 mt-1">
						<Address value={txHash} />
					</div>
				</div>
				<Button onclick={() => window.history.back()} variant="outline" size="sm">
					<ArrowLeftIcon class="mr-2 h-4 w-4" />
					Back
				</Button>
			</div>

			<Separator.Root />

			<!-- Transaction Details -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Transaction</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-4 md:grid-cols-2">
						<div>
							<div class="text-sm font-medium text-muted-foreground">Block Number</div>
							<div class="font-mono">{Number(tx.blockNumber)}</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Status</div>
							<div class="font-mono">{formatTxStatus(receipt.status)}</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">From</div>
							<div class="font-mono"><Address value={tx.from} /></div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">To</div>
							{#if tx.to}
								<div class="font-mono"><Address value={tx.to} /></div>
							{:else}
								<div class="font-mono text-muted-foreground">Contract Creation</div>
							{/if}
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Value</div>
							<div class="font-mono">{formatValue(tx.value)}</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Gas Used</div>
							<div class="font-mono">
								{formatGas(receipt.gasUsed)} / {formatGas(tx.gas)}
							</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Gas Price</div>
							<div class="font-mono">{formatGasPrice(receipt.effectiveGasPrice)}</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Type</div>
							<div class="font-mono">{tx.type || 'Legacy'}</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Events -->
			{#if receipt.logs.length > 0}
				<Card.Root>
					<Card.Header>
						<div class="flex items-center gap-2">
							<FileCodeIcon class="h-5 w-5" />
							<Card.Title>Events ({receipt.logs.length})</Card.Title>
						</div>
					</Card.Header>
					<Card.Content>
						{#if decodedEvents.length === 0}
							<div class="space-y-4">
								{#each receipt.logs as log, i}
									<div class="rounded-lg bg-muted/50 p-4">
										<div class="text-sm font-medium text-muted-foreground mb-2">
											Log #{i + 1}
										</div>
										<div class="grid gap-2 text-sm">
											<div>
												<span class="font-medium text-muted-foreground">Address:</span>
												<span class="font-mono ml-2"><Address value={log.address} /></span>
											</div>
											<div>
												<span class="font-medium text-muted-foreground">Topics:</span>
												<pre class="mt-1 font-mono text-xs bg-background p-2 rounded">{JSON.stringify(log.topics, null, 2)}</pre>
											</div>
											<div>
												<span class="font-medium text-muted-foreground">Data:</span>
												<pre class="mt-1 font-mono text-xs bg-background p-2 rounded overflow-x-auto">{log.data}</pre>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="space-y-4">
								{#each decodedEvents as event}
									{@const contractInfo = findContractByAddress(event.address)}
									<div class="rounded-lg border p-4">
										<div class="flex items-start justify-between mb-2">
											<div>
												<div class="font-semibold text-lg">{event.eventName}</div>
												{#if contractInfo}
													<div class="text-sm text-muted-foreground">
														Contract: {contractInfo.name}
													</div>
												{/if}
											</div>
											<Address value={event.address} />
										</div>
										<Separator.Root class="my-3" />
										<div class="grid gap-3">
											<div class="text-sm">
												<span class="font-medium text-muted-foreground">Block:</span>
												<span class="font-mono ml-2">{Number(event.blockNumber)}</span>
											</div>
											<div class="text-sm">
												<span class="font-medium text-muted-foreground">Transaction:</span>
												<span class="font-mono ml-2"><Address value={event.txHash as `0x${string}`} /></span>
											</div>
											<div>
												<div class="text-sm font-medium text-muted-foreground mb-2">Parameters</div>
												<pre class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"><code
													>{JSON.stringify(event.args, null, 2)}</code
												></pre>
											</div>
										</div>
									</div>
								{/each}

								{#if decodedEvents.length < receipt.logs.length}
									<Alert.Root>
										<FileCodeIcon class="h-4 w-4" />
										<Alert.Description>
											{receipt.logs.length - decodedEvents.length} additional logs could not be decoded
											(unknown contracts)
										</Alert.Description>
									</Alert.Root>
								{/if}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	{/if}
</div>