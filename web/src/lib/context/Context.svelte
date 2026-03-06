<script lang="ts">
	import {setUserContext} from '$lib';
	import type {Context} from './types';
	import {onMount, type Snippet} from 'svelte';

	interface Props {
		context: {context: Context; start: () => () => void};
		children?: Snippet;
	}

	let {context, children}: Props = $props();
	setUserContext(() => context.context);

	onMount(() => {
		return context.start();
	});
</script>

{@render children?.()}
