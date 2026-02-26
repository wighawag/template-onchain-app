<script lang="ts">
	import type {Dependencies} from '$lib/types';
	import type {Snippet} from 'svelte';
	import Context from './Context.svelte';
	interface Props {
		getContext: () => Promise<Dependencies>;
		children?: Snippet;
		loading?: Snippet;
		// minLoading?: number; // TODO implement a minimum loading for splashscreen
	}

	let {getContext, children, loading}: Props = $props();

	let promise = (() => getContext())();
</script>

{#await promise}
	{#if loading}
		{@render loading()}
	{:else}
		Please wait...
	{/if}
{:then context}
	<Context {context}>{@render children?.()}</Context>
{/await}
