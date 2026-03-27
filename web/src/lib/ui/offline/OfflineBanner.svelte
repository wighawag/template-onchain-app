<script lang="ts">
	import {getUserContext} from '$lib';
	import CloudOffIcon from '@lucide/svelte/icons/cloud-off';

	const {offline} = getUserContext();
</script>

{#if $offline.offline}
	<div
		class="flex w-full items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2"
	>
		<CloudOffIcon class="h-4 w-4 shrink-0 text-destructive" />
		<span class="text-sm text-destructive">
			You are offline. Some features may be unavailable until connectivity is restored.
		</span>
	</div>
{/if}
