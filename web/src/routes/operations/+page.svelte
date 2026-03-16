<script lang="ts">
	import DefaultHead from '$lib/metadata/DefaultHead.svelte';
	import ConnectionFlow from '$lib/core/connection/ConnectionFlow.svelte';
	import {getUserContext} from '$lib';
	import * as Empty from '$lib/shadcn/ui/empty';
	import * as Separator from '$lib/shadcn/ui/separator';
	import {ListIcon} from '@lucide/svelte';
	import OperationCard from './components/OperationCard.svelte';

	const {connection, accountData} = getUserContext();

	let currentAccountData = $derived($accountData);
	let operationIds = $derived(currentAccountData?.watchItemIds('operations'));

	// Dismiss operation
	function dismissOperation(id: string) {
		if (!currentAccountData) return;
		currentAccountData.removeItem('operations', id);
	}

	// Bump gas price (placeholder)
	async function bumpGasPrice(id: string) {
		alert('Bump gas price feature coming soon!');
	}
</script>

<DefaultHead title={'Operations'} />

<ConnectionFlow {connection} />

<div class="container mx-auto max-w-5xl px-4 py-8">
	<div class="space-y-6">
		<div class="flex flex-col items-center space-y-2">
			<div class="rounded-full bg-primary/10 p-3">
				<ListIcon class="h-8 w-8 text-primary" />
			</div>
			<h1 class="text-3xl font-bold">Operations</h1>
			<p class="text-muted-foreground">
				Track your pending and completed blockchain operations
			</p>
		</div>

		<Separator.Root />

		{#if !$currentAccountData || $currentAccountData.status === 'idle'}
			<Empty.Root class="min-h-[400px]">
				<Empty.Header>
					<Empty.Media variant="icon">
						<ListIcon />
					</Empty.Media>
					<Empty.Title>No Account Connected</Empty.Title>
					<Empty.Description>
						Connect your wallet to view your operations.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else if $currentAccountData.isLoading}
			<div class="flex flex-col items-center justify-center py-12">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
				></div>
				<p class="mt-4 text-muted-foreground">Loading operations...</p>
			</div>
		{:else if !$operationIds || $operationIds.length === 0}
			<Empty.Root class="min-h-[400px]">
				<Empty.Header>
					<Empty.Media variant="icon">
						<ListIcon />
					</Empty.Media>
					<Empty.Title>No Operations</Empty.Title>
					<Empty.Description>
						You haven't performed any operations yet. Once you interact with
						contracts, your transactions will appear here.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="space-y-4">
				{#each $operationIds as id (id)}
					<OperationCard
						{id}
						operationStore={$accountData!.watchItem('operations', id)}
						onDismiss={dismissOperation}
						onBumpGas={bumpGasPrice}
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>
