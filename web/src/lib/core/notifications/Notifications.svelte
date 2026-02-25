<script lang="ts">
	import type {NotificationsService} from '.';
	import type {NotificationClasses} from './types';
	import NotificationCard from './NotificationCard.svelte';

	interface Props {
		notifications: NotificationsService;
		class?: string;
		classes?: Partial<NotificationClasses>;
	}

	const {notifications, class: className, classes = {}}: Props = $props();
</script>

{#each $notifications as n (n.id)}
	<NotificationCard
		title={n.title}
		body={n.body}
		icon={n.icon}
		actions={n.action
			? [
					{label: n.action.label, onClick: () => notifications.onAction(n.id)},
					{label: 'dismiss', onClick: () => notifications.remove(n.id)},
				]
			: [{label: 'dismiss', onClick: () => notifications.remove(n.id)}]}
		class={className}
		{classes}
	/>
{/each}
