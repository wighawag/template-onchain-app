<script lang="ts">
	import type {Dependencies} from '$lib/types';
	import type {Snippet} from 'svelte';
	import Context from './Context.svelte';
	interface Props {
		getContext: () => Promise<Dependencies>;
		children?: Snippet;
	}

	let {getContext, children}: Props = $props();

	let promise = (() => getContext())();
</script>

{#await promise}
	<!-- TODO Splash Screen min 300ms ?-->
	Please wait...
{:then context}
	<Context {context}>{@render children?.()}</Context>
{/await}
