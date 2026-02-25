<script lang="ts">
	import {getUserContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';

	let {name}: {name?: string} = $props();

	const {connection} = getUserContext();
</script>

<nav
	class="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border px-4 sm:px-6 lg:px-8"
>
	<div class="flex items-center">
		<h1 class="text-xl font-bold">{name}</h1>
	</div>

	<div class="flex items-center">
		{#if $connection.step == 'SignedIn'}
			<Button
				onclick={() => connection.disconnect()}
				variant="default"
				size="default"
			>
				Discconnect
			</Button>
		{:else}
			<Button
				onclick={() => connection.connect()}
				variant="default"
				size="default"
			>
				Connect
			</Button>
		{/if}
	</div>
</nav>
