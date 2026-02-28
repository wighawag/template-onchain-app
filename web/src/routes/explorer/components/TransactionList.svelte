<script lang="ts">
	import * as Card from '$lib/shadcn/ui/card';
	import * as Alert from '$lib/shadcn/ui/alert';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import * as Empty from '$lib/shadcn/ui/empty';
	import {RefreshCwIcon, ClockIcon, HashIcon} from '@lucide/svelte';
	import {PUBLIC_EXPLORER_BLOCK_INDEX_ENABLED} from '$env/static/public';
	import {getTransactionListStore} from '../lib/stores/transactionList';
	import {getUserContext} from '$lib';
	import TransactionItem from './TransactionItem.svelte';

	interface Props {
		targetCount?: number;
	}

	let {targetCount = 20}: Props = $props();

	const transactionListStore = getTransactionListStore({
		useBlockIndex: PUBLIC_EXPLORER_BLOCK_INDEX_ENABLED === 'true',
	});
	let dependencies = getUserContext();
	let {publicClient} = $derived(dependencies);

	// Subscribe to store state
	let storeState = $derived($transactionListStore);
	let transactions = $derived(storeState.transactions);
	let loading = $derived(storeState.loading);
	let error = $derived(storeState.error);
	let lastBlockNumber = $derived(storeState.lastBlockNumber);

	// Update the publicClient in the store when it changes
	$effect(() => {
		transactionListStore.setPublicClient(publicClient);
	});

	// Fetch transactions on mount
	async function fetchTransactions() {
		await transactionListStore.fetchTransactions(targetCount);
	}

	$effect(() => {
		if (publicClient && transactions.length === 0 && !loading) {
			fetchTransactions();
		}
	});

	// Refresh transactions
	async function refresh() {
		await transactionListStore.refresh();
	}

	// Get full transaction details with publicClient
	// We need to fetch the actual transaction objects to use in TransactionItem
	let detailedTransactions = $state<
		Array<{
			tx: any;
			blockTimestamp: number;
		}>
	>([]);

	// Fetch detailed transactions when summaries change
	async function fetchDetailedTransactions() {
		if (!publicClient || transactions.length === 0) {
			detailedTransactions = [];
			return;
		}

		try {
			const detailed = await Promise.all(
				transactions.map(async (summary) => {
					try {
						const tx = await publicClient.getTransaction({
							hash: summary.hash as `0x${string}`,
						});
						const block = await publicClient.getBlock({
							blockNumber: summary.blockNumber,
						});
						return {
							tx,
							blockTimestamp: summary.timestamp,
						};
					} catch (e) {
						console.error('Error fetching transaction details:', e);
						return null;
					}
				}),
			);

			// Filter out null values
			detailedTransactions = detailed.filter(
				(t): t is NonNullable<typeof t> => t !== null,
			);
		} catch (e) {
			console.error('Error fetching detailed transactions:', e);
			detailedTransactions = [];
		}
	}

	$effect(() => {
		if (publicClient && transactions.length > 0) {
			fetchDetailedTransactions();
		}
	});
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<ClockIcon class="h-5 w-5 text-muted-foreground" />
				<Card.Title>Recent Transactions</Card.Title>
				{#if lastBlockNumber}
					<span class="text-sm text-muted-foreground"
						>Latest Block: {Number(lastBlockNumber)}</span
					>
				{/if}
			</div>
			<button
				class="flex items-center gap-1 text-sm text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
				disabled={loading}
				onclick={refresh}
			>
				<RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
				Refresh
			</button>
		</div>
	</Card.Header>
	<Card.Content>
		{#if loading}
			<div class="flex flex-col items-center justify-center py-12">
				<Spinner />
				<p class="mt-4 text-muted-foreground">Loading transactions...</p>
			</div>
		{:else if error}
			<Alert.Root variant="destructive">
				<p>{error}</p>
			</Alert.Root>
		{:else if transactions.length === 0}
			<Empty.Root class="min-h-[200px]">
				<Empty.Header>
					<Empty.Media variant="icon">
						<HashIcon />
					</Empty.Media>
					<Empty.Title>No Transactions Found</Empty.Title>
					<Empty.Description>
						There are no recent transactions on this network yet.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else if detailedTransactions.length === 0}
			<div class="flex flex-col items-center justify-center py-12">
				<Spinner />
				<p class="mt-4 text-muted-foreground">Loading transaction details...</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each detailedTransactions as { tx, blockTimestamp } (tx.hash)}
					<TransactionItem {tx} {blockTimestamp} {publicClient} />
				{/each}
			</div>

			{#if transactions.length < targetCount}
				<Separator.Root class="my-4" />
				<p class="text-center text-sm text-muted-foreground">
					Showing {transactions.length} of up to {targetCount} recent transactions
				</p>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
