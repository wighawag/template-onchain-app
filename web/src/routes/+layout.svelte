<script lang="ts">
	import {serviceWorker, notifications} from '$lib';
	import NotificationOverlay from '$lib/core/notifications/NotificationOverlay.svelte';
	import Notifications from '$lib/core/notifications/Notifications.svelte';
	import VersionAndInstallNotfications from '$lib/core/service-worker/VersionAndInstallNotfications.svelte';
	import {Navbar} from '$lib/core/ui/navbar';
	import '../app.css';
	let {children} = $props();
</script>

<Navbar name="Template" />

{@render children()}

<NotificationOverlay>
	<Notifications {notifications} />
</NotificationOverlay>

<VersionAndInstallNotfications
	{serviceWorker}
	classes={{
		root: 'bg-background bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,var(--color-muted)_10px,var(--color-muted)_20px)]',
	}}
/>
