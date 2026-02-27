<script lang="ts">
	import '../app.css';

	import {serviceWorker, notifications} from '$lib';
	import NotificationOverlay from '$lib/core/notifications/NotificationOverlay.svelte';
	import Notifications from '$lib/core/notifications/Notifications.svelte';
	import VersionAndInstallNotfications from '$lib/core/service-worker/VersionAndInstallNotfications.svelte';

	import {createContext} from '$lib/context/index.js';
	import AsyncContext from '$lib/context/AsyncContext.svelte';
	import Navbar from '$lib/core/ui/navbar/navbar.svelte';

	let {children} = $props();
</script>

<AsyncContext getContext={createContext}>
	{#snippet loading()}
		<!-- TODO SplashScreen -->
	{/snippet}
	<Navbar name="Template" />
	{@render children()}
</AsyncContext>

<VersionAndInstallNotfications
	{serviceWorker}
	classes={{
		root: 'bg-background bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,var(--color-muted)_10px,var(--color-muted)_20px)]',
	}}
/>

<NotificationOverlay>
	<Notifications {notifications} />
</NotificationOverlay>

<div id="--layer-drawer"></div>
<div id="--layer-modals"></div>
