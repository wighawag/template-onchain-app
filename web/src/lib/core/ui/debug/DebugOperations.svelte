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
		class="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border rounded-lg shadow-lg overflow-hidden min-w-[200px] max-w-[280px]"
	>
		<!-- Header / Toggle button -->
		<button
			onclick={toggleExpanded}
			class="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
		>
			<div class="flex items-center gap-2">
				<span class="text-xs font-medium">Operations</span>
				{#if operationCount > 0}
					<Badge variant="secondary" class="text-[10px] px-1.5 py-0 h-4">
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
			<div class="border-t max-h-[300px] overflow-y-auto">
				{#if $accountData.status === 'idle'}
					<div class="text-xs text-muted-foreground py-2 px-3">
						No account connected
					</div>
				{:else if $accountData.status === 'loading'}
					<div class="text-xs text-muted-foreground py-2 px-3">
						Loading...
					</div>
				{:else if operationIds.length === 0}
					<div class="text-xs text-muted-foreground py-2 px-3">
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
