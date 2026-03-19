<script lang="ts">
	import '../app.css';

	import {serviceWorker, notifications, params} from '$lib';
	import NotificationOverlay from '$lib/core/notifications/NotificationOverlay.svelte';
	import Notifications from '$lib/core/notifications/Notifications.svelte';
	import VersionAndInstallNotfications from '$lib/core/service-worker/VersionAndInstallNotfications.svelte';

	import {createContext} from '$lib/context/index.js';
	import AsyncContext from '$lib/context/AsyncContext.svelte';
	import Navbar from '$lib/core/ui/navbar/navbar.svelte';
	import {createENSService} from '$lib/core/ens';
	import {setContext} from 'svelte';
	import DebugOperations from '$lib/ui/debug/DebugOperations.svelte';
	import {Toaster} from '$lib/shadcn/ui/sonner';

	let {children} = $props();

	const ensService = createENSService();
	setContext('ens', ensService);
</script>

<AsyncContext getContext={createContext}>
	{#snippet loading()}
		<!-- TODO SplashScreen -->
	{/snippet}
	<Navbar
		name="Template"
		githubUrl="https://github.com/wighawag/template-onchain-app"
	/>
	{@render children()}

	{#if params.transactions}
		<DebugOperations />
	{/if}
</AsyncContext>

<Toaster position="bottom-right" richColors />

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
