<script lang="ts">
	import type {Context} from './types';
	import type {Snippet} from 'svelte';
	import ContextComponent from './Context.svelte';
	import {browser} from '$app/environment';
	interface Props {
		getContext: () => Promise<{context: Context; start: () => () => void}>;
		children?: Snippet;
		loading?: Snippet;
		// minLoading?: number; // TODO implement a minimum loading for splashscreen
	}

	let {getContext, children, loading}: Props = $props();

	let promise = browser ? (() => getContext())() : undefined;
</script>

{#if promise}
	{#await promise}
		{#if loading}
			{@render loading()}
		{:else}
			<div class="splash-screen">
				<img src="/icon.svg" alt="Loading" class="splash-logo" />
			</div>
		{/if}
	{:then context}
		<ContextComponent {context}>{@render children?.()}</ContextComponent>
	{:catch error}
		<div class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
			<p class="text-lg font-semibold text-destructive">Failed to initialize application</p>
			<p class="max-w-md text-sm text-muted-foreground">{error?.message || 'Unknown error'}</p>
			<button
				class="rounded-md border px-4 py-2 text-sm hover:bg-muted"
				onclick={() => window.location.reload()}
			>
				Reload
			</button>
		</div>
	{/await}
{:else if loading}
	{@render loading()}
{:else}
	<div class="splash-screen">
		<img src="/icon.svg" alt="Loading" class="splash-logo" />
	</div>
{/if}

<style>
	.splash-screen {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--background, #000);
	}

	.splash-logo {
		width: min(50vw, 50vh);
		height: min(50vw, 50vh);
		max-width: 400px;
		max-height: 400px;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.7;
			transform: scale(0.95);
		}
	}
</style>
