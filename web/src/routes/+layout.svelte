<script lang="ts">
	import {serviceWorker, notifications} from '$lib';
	import NotificationOverlay from '$lib/core/notifications/NotificationOverlay.svelte';
	import Notifications from '$lib/core/notifications/Notifications.svelte';
	import VersionAndInstallNotfications from '$lib/core/service-worker/VersionAndInstallNotfications.svelte';
	import '../app.css';
	let {children} = $props();
</script>

{@render children()}

<NotificationOverlay>
	<Notifications {notifications} />
	<VersionAndInstallNotfications {serviceWorker} src="" alt="" />
</NotificationOverlay>
