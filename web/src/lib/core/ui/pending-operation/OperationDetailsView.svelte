<script lang="ts">
	import type {OnchainOperation} from '$lib/account/AccountData';
	import Address from '$lib/core/ui/ethereum/Address.svelte';
	import {Badge} from '$lib/shadcn/ui/badge/index.js';

	interface Props {
		operation: OnchainOperation;
	}

	let {operation}: Props = $props();

	// Get operation name from metadata
	let operationName = $derived.by(() => {
		const metadata = operation.metadata;
		if (metadata.type === 'functionCall') {
			return metadata.functionName;
		}
		if (metadata.type === 'unknown') {
			return metadata.name;
		}
		return 'Transaction';
	});

	// Get status string from transaction intent state
	let status = $derived(
		operation.transactionIntent.state?.inclusion || 'Fetching',
	);

	// Format broadcast time
	let broadcastTime = $derived.by(() => {
		const txs = operation.transactionIntent.transactions;
		if (txs.length === 0) return null;

		// Get the earliest broadcast time
		const earliestBroadcast = txs.reduce(
			(min, tx) => {
				if (!tx.broadcastTimestampMs) return min;
				return min === null || tx.broadcastTimestampMs < min
					? tx.broadcastTimestampMs
					: min;
			},
			null as number | null,
		);

		if (!earliestBroadcast) return null;

		const date = new Date(earliestBroadcast);
		return date.toLocaleString();
	});

	// Get from address
	let fromAddress = $derived(
		(operation.metadata.tx.from as `0x${string}`) || null,
	);

	// Get nonce
	let nonce = $derived(operation.metadata.tx.nonce);

	// Get status badge variant
	let statusVariant = $derived.by(() => {
		switch (status) {
			case 'NotFound':
			case 'Dropped':
				return 'destructive' as const;
			case 'Included':
				return 'default' as const;
			case 'InMemPool':
			default:
				return 'secondary' as const;
		}
	});
</script>

<div class="space-y-4">
	<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
		<span class="text-muted-foreground">Operation:</span>
		<span class="font-medium">{operationName}</span>

		<span class="text-muted-foreground">Status:</span>
		<span>
			<Badge variant={statusVariant}>{status}</Badge>
		</span>

		{#if fromAddress}
			<span class="text-muted-foreground">From:</span>
			<span>
				<Address value={fromAddress} />
			</span>
		{/if}

		{#if nonce !== undefined}
			<span class="text-muted-foreground">Nonce:</span>
			<span class="font-mono">{nonce}</span>
		{/if}

		{#if broadcastTime}
			<span class="text-muted-foreground">Broadcast:</span>
			<span>{broadcastTime}</span>
		{/if}
	</div>
</div>
