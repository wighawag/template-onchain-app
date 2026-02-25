<script lang="ts">
	import type {NotificationsService} from '.';
	import type {NotificationClasses} from './types';
	import NotificationCard from './NotificationCard.svelte';

	interface Props {
		notifications: NotificationsService;
		class?: string;
		classes?: Partial<NotificationClasses>;
	}

	const {notifications, class: className = '', classes = {}}: Props = $props();
</script>

<div class={className}>
	{#each $notifications as n (n.id)}
		<NotificationCard
			title={n.data.title}
			body={n.data.options?.body}
			icon={n.data.options?.icon}
			actions={[
				{label: 'ok', onClick: () => notifications.onClick(n.id)},
				{label: 'dismiss', onClick: () => notifications.remove(n.id)},
			]}
			{classes}
		/>
	{/each}
</div>