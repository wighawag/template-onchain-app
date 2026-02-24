<script lang="ts">
	import type {NotificationClasses} from './types';
	import NotificationCard, {type NotificationAction} from './NotificationCard.svelte';

	export interface NotificationItem {
		id: string;
		title: string;
		body?: string;
		icon?: string;
		actions?: NotificationAction[];
		onClose?: () => void;
	}

	interface Props {
		notifications: NotificationItem[];
		class?: string;
		classes?: Partial<NotificationClasses>;
	}

	const {notifications, class: className = '', classes = {}}: Props = $props();
</script>

<!-- Global notification live region, render this permanently at the end of the document -->
<div
	aria-live="assertive"
	class="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 {className}"
>
	<div class="flex w-full flex-col items-center space-y-4 sm:items-end">
		{#each notifications as notification (notification.id)}
			<NotificationCard
				title={notification.title}
				body={notification.body}
				icon={notification.icon}
				actions={notification.actions}
				onClose={notification.onClose}
				{classes}
			/>
		{/each}
	</div>
</div>