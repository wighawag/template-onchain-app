<script lang="ts">
	import {getUserContext} from '$lib';
	import {Badge} from '$lib/shadcn/ui/badge';
	import {ChevronUpIcon, ChevronDownIcon} from '@lucide/svelte';
	import DebugOperationItem from './DebugOperationItem.svelte';

	const {accountData} = getUserContext();

	let expanded = $state(false);

	// Get operation IDs
	let operationIds = $derived.by(() => {
		if ($accountData.status === 'ready') {
			return Object.keys($accountData.data.operations).map(Number);
		}
		return [];
	});

	// Get total count for the badge
	let operationCount = $derived(operationIds.length);

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
				{#if $accountData.status === 'idle'}
					<div class="px-3 py-2 text-xs text-muted-foreground">
						No account connected
					</div>
				{:else if $accountData.status === 'loading'}
					<div class="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
				{:else if operationIds.length === 0}
					<div class="px-3 py-2 text-xs text-muted-foreground">
						No operations
					</div>
				{:else}
					<div class="divide-y">
						{#each operationIds as id (id)}
							<DebugOperationItem
								operationStore={accountData.getOperationStore(id)}
							/>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
