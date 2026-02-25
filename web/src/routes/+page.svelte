<script lang="ts">
	import DefaultHead from './metadata/DefaultHead.svelte';

	import {browser} from '$app/environment';
	import {createDependencies} from '$lib/dependencies.js';
	import ScreenLoader from '$lib/screens/ScreenLoader.svelte';
</script>

<DefaultHead title={'Template'} />

{#if browser}
	<ScreenLoader {createDependencies} />
{/if}
