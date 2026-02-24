<script lang="ts">
	import {serviceWorker, notifications} from '$lib';
	import Notifications from '$lib/core/notifications/Notifications.svelte';
	import VersionAndInstallNotfications from '$lib/core/service-worker/VersionAndInstallNotfications.svelte';
	import '../app.css';
	let {children} = $props();
</script>

{@render children()}

<Notifications {notifications} />

<VersionAndInstallNotfications {serviceWorker} src="" alt="" />
