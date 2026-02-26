<script lang="ts">
	import '../app.css';

	import {serviceWorker, notifications} from '$lib';
	import NotificationOverlay from '$lib/core/notifications/NotificationOverlay.svelte';
	import Notifications from '$lib/core/notifications/Notifications.svelte';
	import VersionAndInstallNotfications from '$lib/core/service-worker/VersionAndInstallNotfications.svelte';

	import {browser} from '$app/environment';
	import {createDependencies} from '$lib/dependencies.js';
	import ContextLoader from '$lib/context/ContextLoader.svelte';
	import Navbar from '$lib/core/ui/navbar/navbar.svelte';

	let {children} = $props();
</script>

{#if browser}
	<ContextLoader getContext={createDependencies}>
		<Navbar name="Template" />
		{@render children()}
	</ContextLoader>
{/if}

<NotificationOverlay>
	<Notifications {notifications} />
</NotificationOverlay>

<VersionAndInstallNotfications
	{serviceWorker}
	classes={{
		root: 'bg-background bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,var(--color-muted)_10px,var(--color-muted)_20px)]',
	}}
/>

<div id="--layer-drawer"></div>
<div id="--layer-modals"></div>
