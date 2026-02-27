<script lang="ts">
	import {setUserContext} from '$lib';
	import type {Context} from './types';
	import type {Snippet} from 'svelte';

	interface Props {
		context: Context;
		children?: Snippet;
	}

	let {context, children}: Props = $props();
	setUserContext(() => context);
</script>

{@render children?.()}
