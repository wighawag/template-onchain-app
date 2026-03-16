<script lang="ts">
	import {getUserContext} from '$lib';
	import {Badge} from '$lib/shadcn/ui/badge';
	import {ChevronUpIcon, ChevronDownIcon} from '@lucide/svelte';
	import DebugOperationItem from './DebugOperationItem.svelte';

	const {accountData} = getUserContext();

	let expanded = $state(false);

	let currentAccountData = $derived($accountData);
	let operationIds = $derived(currentAccountData?.watchItemIds('operations'));
	let operationCount = $derived($operationIds?.length || 0);

	function toggleExpanded() {
		expanded = !expanded;
	}
</script>

<div class="fixed bottom-4 left-4 z-50">
	<div
		class="max-w-[280px] min-w-[200px] overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
	>
		<!-- Header / Toggle button -->
		<button
			onclick={toggleExpanded}
			class="flex w-full items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-muted/50"
		>
			<div class="flex items-center gap-2">
				<span class="text-xs font-medium">Operations</span>
				{#if operationCount > 0}
					<Badge variant="secondary" class="h-4 px-1.5 py-0 text-[10px]">
						{operationCount}
					</Badge>
				{/if}
			</div>
			{#if expanded}
				<ChevronDownIcon class="h-4 w-4" />
			{:else}
				<ChevronUpIcon class="h-4 w-4" />
			{/if}
		</button>

		<!-- Expanded list -->
		{#if expanded}
			<div class="max-h-[300px] overflow-y-auto border-t">
				{#if $currentAccountData?.status === 'idle'}
					<div class="px-3 py-2 text-xs text-muted-foreground">
						No account connected
					</div>
				{:else if $currentAccountData?.isLoading}
					<div class="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
				{:else if operationCount == 0}
					<div class="px-3 py-2 text-xs text-muted-foreground">
						No operations
					</div>
				{:else}
					<div class="divide-y">
						{#each $operationIds as id (id)}
							<DebugOperationItem
								operationStore={$accountData!.watchItem('operations', id)}
							/>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
