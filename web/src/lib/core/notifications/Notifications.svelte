<script lang="ts">
	import type {NotificationsService} from '.';
	import type {NotificationClasses} from './types';
	import NotificationContainer, {type NotificationItem} from './NotificationContainer.svelte';

	interface Props {
		notifications: NotificationsService;
		class?: string;
		classes?: Partial<NotificationClasses>;
	}

	const {notifications, class: className = '', classes = {}}: Props = $props();

	const notificationItems: NotificationItem[] = $derived(
		$notifications.map((n) => ({
			id: String(n.id),
			title: n.data.title,
			body: n.data.options?.body,
			icon: n.data.options?.icon,
			actions: [
				{label: 'ok', onClick: () => notifications.onClick(n.id)},
				{label: 'dismiss', onClick: () => notifications.remove(n.id)},
			],
		})),
	);
</script>

<NotificationContainer notifications={notificationItems} class={className} {classes} />