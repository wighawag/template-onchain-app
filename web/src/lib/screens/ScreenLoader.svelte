<script lang="ts">
	import type {Dependencies} from '$lib/types';
	import MainScreen from './MainScreen.svelte';
	interface Props {
		createDependencies: () => Promise<Dependencies>;
	}

	let {createDependencies}: Props = $props();

	let promise = (() => createDependencies())();
</script>

{#await promise}
	<!-- TODO -->
	Please wait...
{:then dependencies}
	<MainScreen {dependencies} />
{/await}
