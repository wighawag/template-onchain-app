<script lang="ts">
	import { Button } from '$lib/shadcn/ui/button';

	const { data } = $props();
</script>

<svelte:head>
	<title>Error Testing | Debug</title>
</svelte:head>

<div class="min-h-screen p-8 bg-background">
	<div class="max-w-2xl mx-auto">
		<h1 class="text-3xl font-bold mb-2">Error Page Testing</h1>
		<p class="text-muted-foreground mb-8">
			Click any button below to trigger the corresponding error and test the error page rendering.
		</p>

		<div class="grid gap-4 sm:grid-cols-2">
			{#each data.availableErrors as { status, label }}
				<Button
					href="/debug/error?status={status}"
					variant={status >= 500 ? 'destructive' : 'outline'}
					class="justify-start h-auto py-3 px-4"
				>
					<span class="font-mono font-bold mr-3">{status}</span>
					<span>{label}</span>
				</Button>
			{/each}
		</div>

		<div class="mt-8 pt-8 border-t border-border">
			<h2 class="text-xl font-semibold mb-4">Custom Error</h2>
			<form class="flex gap-4 flex-wrap items-end" action="/debug/error" method="GET">
				<div class="flex-1 min-w-32">
					<label for="status" class="block text-sm font-medium mb-1">Status Code</label>
					<input
						type="number"
						id="status"
						name="status"
						min="400"
						max="599"
						value="500"
						class="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
					/>
				</div>
				<div class="flex-[2] min-w-48">
					<label for="message" class="block text-sm font-medium mb-1">Message (optional)</label>
					<input
						type="text"
						id="message"
						name="message"
						placeholder="Custom error message"
						class="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
					/>
				</div>
				<Button type="submit" variant="destructive">Trigger Error</Button>
			</form>
		</div>

		<div class="mt-8">
			<Button href="/" variant="ghost">← Back to Home</Button>
		</div>
	</div>
</div>
