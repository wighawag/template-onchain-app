<script lang="ts">
	import type {ServiceWorkerStore} from '.';
	import type {NotificationClasses} from '$lib/core/notifications/types';
	import NotificationContainer, {type NotificationItem} from '$lib/core/notifications/NotificationContainer.svelte';

	interface Props {
		serviceWorker: ServiceWorkerStore;
		src: string;
		alt: string;
		class?: string;
		classes?: Partial<NotificationClasses>;
	}

	const {
		serviceWorker,
		src,
		alt,
		class: className = '',
		classes = {},
	}: Props = $props();

	function skip() {
		serviceWorker.skip();
	}

	function accept() {
		console.log(`accepting update...`);
		serviceWorker.skipWaiting();
	}

	const updateAvailable = $derived(
		$serviceWorker &&
		!$serviceWorker.notSupported &&
		!$serviceWorker.registering &&
		$serviceWorker.updateAvailable &&
		$serviceWorker.registration,
	);

	const notifications: NotificationItem[] = $derived(
		updateAvailable
			? [
					{
						id: 'sw-update',
						title: 'A new version is available.',
						body: 'Reload to get the update.',
						icon: src,
						actions: [
							{label: 'Reload', onClick: accept, primary: true},
							{label: 'Dismiss', onClick: skip},
						],
						onClose: skip,
					},
				]
			: [],
	);
</script>

<NotificationContainer notifications={notifications} class={className} {classes} />