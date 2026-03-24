<script lang="ts">
	import {route} from '$lib';
	import * as Card from '$lib/shadcn/ui/card';
	import {Badge} from '$lib/shadcn/ui/badge';
	import {Button} from '$lib/shadcn/ui/button';
	import ExternalLinkIcon from '@o7/icon/lucide/external-link.svelte';
	import ClockIcon from '@o7/icon/lucide/clock.svelte';
	import CircleCheckIcon from '@o7/icon/lucide/circle-check.svelte';
	import TriangleAlertIcon from '@o7/icon/lucide/triangle-alert.svelte';
	import CircleXIcon from '@o7/icon/lucide/circle-x.svelte';
	import CircleQuestionMarkIcon from '@o7/icon/lucide/circle-question-mark.svelte';
	import SearchIcon from '@o7/icon/lucide/search.svelte';
	import type {OnchainOperation} from '$lib/account/AccountData';
	import type {TransactionIntent} from '@etherkit/tx-observer';
	import type {Readable} from 'svelte/store';
	import {pendingOperationModal} from '$lib/ui/pending-operation';
	import TransactionHash from '$lib/core/ui/ethereum/TransactionHash.svelte';

	interface Props {
		id: string;
		operationStore: Readable<OnchainOperation | undefined>;
	}

	let {id, operationStore}: Props = $props();

	// Subscribe to the operation store
	// let operation = $derived($operationStore);

	// Helper to get block explorer URL
	function getExplorerTxUrl(hash: string): string {
		return route(`/explorer/tx/${hash}`);
	}

	// Helper to get status info
	function getStatusInfo(intent: TransactionIntent): {
		label: string;
		variant: 'default' | 'secondary' | 'destructive' | 'outline';
		icon: typeof CircleCheckIcon;
	} {
		const state = intent.state;

		if (!state || state.inclusion === 'InMemPool') {
			return {label: 'Pending', variant: 'secondary', icon: ClockIcon};
		}

		if (state.inclusion === 'NotFound') {
			return {
				label: 'Not Found',
				variant: 'destructive',
				icon: CircleQuestionMarkIcon,
			};
		}

		if (state.inclusion === 'Dropped') {
			return {
				label: 'Dropped',
				variant: 'destructive',
				icon: TriangleAlertIcon,
			};
		}

		if (state.inclusion === 'Included') {
			if (state.status === 'Success') {
				return {label: 'Success', variant: 'default', icon: CircleCheckIcon};
			} else {
				return {label: 'Failed', variant: 'destructive', icon: CircleXIcon};
			}
		}

		return {label: 'Unknown', variant: 'outline', icon: CircleQuestionMarkIcon};
	}

	// Get the main transaction hash
	function getMainTxHash(intent: TransactionIntent): `0x${string}` | undefined {
		if (intent.transactions.length === 0) return undefined;

		const state = intent.state;
		if (state?.inclusion === 'Included' && state.attemptIndex !== undefined) {
			return intent.transactions[state.attemptIndex]?.hash;
		}

		return intent.transactions[0]?.hash;
	}

	// Get operation name from metadata
	function getOperationName(op: OnchainOperation): string {
		const metadata = op.metadata;
		if (metadata.type === 'functionCall') {
			return metadata.functionName;
		}
		if (metadata.type === 'unknown') {
			return metadata.name;
		}
		return 'Unknown Operation';
	}

	// Format timestamp
	function formatTimestamp(timestampMs: number): string {
		const date = new Date(timestampMs);
		return date.toLocaleString();
	}
</script>

{#if $operationStore}
	{@const statusInfo = getStatusInfo($operationStore.transactionIntent)}
	{@const StatusIcon = statusInfo.icon}
	{@const txHash = getMainTxHash($operationStore.transactionIntent)}
	{@const state = $operationStore.transactionIntent.state}
	{@const firstTx = $operationStore.transactionIntent.transactions[0]}

	<Card.Root>
		<Card.Header class="pb-2">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<StatusIcon class="h-5 w-5" />
					<Card.Title class="text-lg">
						{getOperationName($operationStore)}
					</Card.Title>
				</div>
				<div class="flex items-center gap-2">
					{#if state?.final !== undefined}
						<Badge variant="outline">Final</Badge>
					{/if}
					<Badge variant={statusInfo.variant}>
						{statusInfo.label}
					</Badge>
				</div>
			</div>
			{#if firstTx}
				<Card.Description>
					{formatTimestamp(firstTx.broadcastTimestampMs)}
				</Card.Description>
			{/if}
		</Card.Header>

		<Card.Content>
			<div class="space-y-3">
				<!-- Transaction Details -->
				{#if $operationStore.transactionIntent.transactions.length === 1 && txHash}
					<div class="flex items-center gap-2 text-sm">
						<span class="text-muted-foreground">Transaction:</span>
						<span class="ml-2 font-mono"
							><TransactionHash value={txHash} linkTo="auto" /></span
						>
					</div>
				{:else if $operationStore.transactionIntent.transactions.length > 1}
					<div class="text-sm text-muted-foreground">
						{$operationStore.transactionIntent.transactions.length} transaction attempts
					</div>
					<div class="space-y-1">
						{#each $operationStore.transactionIntent.transactions as tx, i}
							<div class="flex items-center gap-2 text-sm">
								<span class="text-muted-foreground">#{i + 1}:</span>
								<code class="rounded bg-muted px-2 py-1 font-mono text-xs">
									{tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
								</code>
								{#if state?.inclusion === 'Included' && state.attemptIndex === i}
									<Badge variant="default" class="text-xs">Included</Badge>
									<a
										href={getExplorerTxUrl(tx.hash)}
										class="inline-flex items-center gap-1 text-primary hover:underline"
									>
										<ExternalLinkIcon class="h-4 w-4" />
										View
									</a>
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<!-- Finality info -->
				{#if state?.final !== undefined}
					<div class="text-sm text-muted-foreground">
						Finalized at block {state.final}
					</div>
				{/if}

				<!-- Operation metadata args -->
				{#if $operationStore.metadata.type === 'functionCall' && $operationStore.metadata.args && $operationStore.metadata.args.length > 0}
					<details class="text-sm">
						<summary
							class="cursor-pointer text-muted-foreground hover:text-foreground"
						>
							Show arguments ({$operationStore.metadata.args.length})
						</summary>
						<pre
							class="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(
								$operationStore.metadata.args,
								null,
								2,
							)}</pre>
					</details>
				{/if}
			</div>
		</Card.Content>

		<Card.Footer class="flex justify-end gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => pendingOperationModal.open(id, $operationStore)}
			>
				<SearchIcon class="mr-1 h-4 w-4" />
				Inspect
			</Button>
		</Card.Footer>
	</Card.Root>
{/if}
