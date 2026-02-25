<script lang="ts">
	import Button from '$lib/shadcn/ui/button/button.svelte';

	let {name}: {name?: string} = $props();

	async function handleConnect() {
		// Placeholder for wallet connection logic
		console.log('Connect button clicked');
	}
</script>

<nav
	class="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border px-4 sm:px-6 lg:px-8"
>
	<div class="flex items-center">
		<h1 class="text-xl font-bold">{name}</h1>
	</div>

	<div class="flex items-center">
		<Button onclick={handleConnect} variant="default" size="default">
			Connect
		</Button>
	</div>
</nav>
