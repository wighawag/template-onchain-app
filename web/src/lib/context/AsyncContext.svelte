<script lang="ts">
	import type {Context} from './types';
	import type {Snippet} from 'svelte';
	import ContextComponent from './Context.svelte';
	import {browser} from '$app/environment';
	interface Props {
		getContext: () => Promise<Context>;
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
			Please wait...
		{/if}
	{:then context}
		<ContextComponent {context}>{@render children?.()}</ContextComponent>
	{/await}
{:else if loading}
	{@render loading()}
{/if}
