<script lang="ts">
	import {setUserContext} from '$lib';
	import type {Dependencies} from '$lib/types';
	import type {Snippet} from 'svelte';

	interface Props {
		context: Dependencies;
		children?: Snippet;
	}

	let {context, children}: Props = $props();
	setUserContext(() => context);
</script>

{@render children?.()}
