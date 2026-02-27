<script lang="ts">
	import DefaultHead from '../../metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {getUserContext} from '$lib';
	import * as Card from '$lib/shadcn/ui/card';
	import * as Alert from '$lib/shadcn/ui/alert';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Empty from '$lib/shadcn/ui/empty';
	import {
		ArrowLeftIcon,
		CheckCircleIcon,
		XCircleIcon,
		FileCodeIcon,
		HashIcon,
	} from '@lucide/svelte';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import type {PublicClient} from 'viem';
	import {
		decodeLogs,
		formatGas,
		formatGasPrice,
		formatValue,
		formatTxStatus,
		findContractByAddress,
	} from '../lib/utils';
	import {
		decodeTransaction,
		formatDecodedTransaction,
		type DecodedTransactionData,
	} from '$lib/services/transactionDecoder';

	interface Props {
		txHash: `0x${string}` | null;
	}

	let {txHash}: Props = $props();

	let dependencies = getUserContext();
	let {publicClient, connection} = $derived(dependencies);

	let tx = $state<Awaited<ReturnType<PublicClient['getTransaction']>> | null>(
		null,
	);
	let receipt = $state<Awaited<
		ReturnType<PublicClient['getTransactionReceipt']>
	> | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let decodedEvents = $state<
		Array<{
			eventName: string;
			signature: string;
			args: Record<string, unknown> | unknown[];
			address: `0x${string}`;
			blockNumber: bigint;
			txHash: string;
		}>
	>([]);
	let decodedTxData = $state<DecodedTransactionData>({
		isDecoded: false,
		status: 'pending',
	});
	let formattedTxData = $derived(formatDecodedTransaction(decodedTxData));

	async function fetchTransaction() {
		if (!publicClient || !txHash) {
			if (!txHash) {
				loading = false;
			} else {
				error = 'Public client not available';
				loading = false;
			}
			return;
		}

		loading = true;
		error = null;

		try {
			// Fetch transaction
			const transaction = await publicClient.getTransaction({hash: txHash});
			tx = transaction;

			// Fetch receipt
			const txReceipt = await publicClient.getTransactionReceipt({
				hash: txHash,
			});
			receipt = txReceipt;

			// Decode transaction data
			const decoded = await decodeTransaction(
				transaction,
				txReceipt,
				publicClient,
			);
			decodedTxData = decoded;

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

	// Fetch when txHash changes
	$effect(() => {
		if (txHash) {
			fetchTransaction();
		}
	});
</script>

<DefaultHead title={'Transaction Explorer'} />

<ConnectionFlow {connection} />

<div class="container mx-auto max-w-5xl px-4 py-8">
	{#if !txHash}
		<Empty.Root class="min-h-[400px]">
			<Empty.Header>
				<Empty.Media variant="icon">
					<HashIcon />
				</Empty.Media>
				<Empty.Title>No Transaction Hash</Empty.Title>
				<Empty.Description>
					Provide a transaction hash in the URL to view its details.
					<br />
					Example:
					<code class="rounded bg-muted px-1 text-xs">/explorer/tx/0x...</code>
				</Empty.Description>
			</Empty.Header>
			<Button onclick={() => window.history.back()} variant="outline">
				<ArrowLeftIcon class="mr-2 h-4 w-4" />
				Go Back
			</Button>
		</Empty.Root>
	{:else if loading}
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
			<div
				class="flex flex-col justify-between gap-4 md:flex-row md:items-center"
			>
				<div class="flex-1">
					<!-- Transaction Method/Function -->
					{#if decodedTxData.isDecoded && formattedTxData.methodLabel}
						<div class="text-2xl font-bold">{formattedTxData.methodLabel}</div>
						{#if formattedTxData.methodDetails}
							<div
								class="truncate text-sm text-muted-foreground"
								title={formattedTxData.methodDetails}
							>
								{formattedTxData.methodDetails}
							</div>
						{/if}
					{:else if tx.to}
						<div class="text-2xl font-bold">Contract Call</div>
					{:else}
						<div class="text-2xl font-bold">Contract Creation</div>
					{/if}

					<!-- Transaction Hash -->
					<div class="mt-1 flex items-center gap-2">
						<Address value={txHash} />
					</div>

					<!-- Transaction Status -->
					<div class="mt-2 flex items-center gap-2">
						{#if decodedTxData.status === 'success'}
							<div class="flex items-center gap-1 text-sm text-green-600">
								<CheckCircleIcon class="h-4 w-4" />
								<span class="font-semibold">Success</span>
							</div>
						{:else if decodedTxData.status === 'failed'}
							<div class="flex items-center gap-1 text-sm text-red-600">
								<XCircleIcon class="h-4 w-4" />
								<span class="font-semibold">Failed</span>
								{#if decodedTxData.error}
									<span class="text-sm text-muted-foreground"
										>- {decodedTxData.error}</span
									>
								{/if}
							</div>
						{:else}
							<div class="flex items-center gap-1 text-sm text-yellow-600">
								<XCircleIcon class="h-4 w-4 animate-spin" />
								<span class="font-semibold">Pending</span>
							</div>
						{/if}
					</div>
				</div>
				<Button
					onclick={() => window.history.back()}
					variant="outline"
					size="sm"
				>
					<ArrowLeftIcon class="mr-2 h-4 w-4" />
					Back
				</Button>
			</div>

			<Separator.Root />

			<!-- Function Arguments (if decoded) -->
			{#if decodedTxData.isDecoded && decodedTxData.args}
				<Card.Root>
					<Card.Header>
						<Card.Title>Function Arguments</Card.Title>
					</Card.Header>
					<Card.Content>
						<pre
							class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"><code
								>{JSON.stringify(decodedTxData.args, null, 2)}</code
							></pre>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Transaction Details -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Transaction</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="grid gap-4 md:grid-cols-2">
						<div>
							<div class="text-sm font-medium text-muted-foreground">
								Block Number
							</div>
							<div class="font-mono">{Number(tx.blockNumber)}</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">
								Status
							</div>
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
								<div class="font-mono text-muted-foreground">
									Contract Creation
								</div>
							{/if}
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">Value</div>
							<div class="font-mono">{formatValue(tx.value)}</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">
								Gas Used
							</div>
							<div class="font-mono">
								{formatGas(receipt.gasUsed)} / {formatGas(tx.gas)}
							</div>
						</div>
						<div>
							<div class="text-sm font-medium text-muted-foreground">
								Gas Price
							</div>
							<div class="font-mono">
								{formatGasPrice(receipt.effectiveGasPrice)}
							</div>
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
										<div class="mb-2 text-sm font-medium text-muted-foreground">
											Log #{i + 1}
										</div>
										<div class="grid gap-2 text-sm">
											<div>
												<span class="font-medium text-muted-foreground"
													>Address:</span
												>
												<span class="ml-2 font-mono"
													><Address value={log.address} /></span
												>
											</div>
											<div>
												<span class="font-medium text-muted-foreground"
													>Topics:</span
												>
												<pre
													class="mt-1 rounded bg-background p-2 font-mono text-xs">{JSON.stringify(
														log.topics,
														null,
														2,
													)}</pre>
											</div>
											<div>
												<span class="font-medium text-muted-foreground"
													>Data:</span
												>
												<pre
													class="mt-1 overflow-x-auto rounded bg-background p-2 font-mono text-xs">{log.data}</pre>
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
										<div class="mb-2 flex items-start justify-between">
											<div>
												<div class="text-lg font-semibold">
													{event.eventName}
												</div>
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
												<span class="font-medium text-muted-foreground"
													>Block:</span
												>
												<span class="ml-2 font-mono"
													>{Number(event.blockNumber)}</span
												>
											</div>
											<div class="text-sm">
												<span class="font-medium text-muted-foreground"
													>Transaction:</span
												>
												<span class="ml-2 font-mono"
													><Address
														value={event.txHash as `0x${string}`}
													/></span
												>
											</div>
											<div>
												<div
													class="mb-2 text-sm font-medium text-muted-foreground"
												>
													Parameters
												</div>
												<pre
													class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"><code
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
											{receipt.logs.length - decodedEvents.length} additional logs
											could not be decoded (unknown contracts)
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
