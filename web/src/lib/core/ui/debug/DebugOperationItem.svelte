<script lang="ts">
	import {Badge} from '$lib/shadcn/ui/badge';
	import {
		ClockIcon,
		CircleCheckIcon,
		TriangleAlertIcon,
		CircleXIcon,
		CircleQuestionMarkIcon,
	} from '@lucide/svelte';
	import type {OnchainOperation} from '$lib/account/AccountData';
	import type {TransactionIntent} from '@etherkit/tx-observer';
	import type {Readable} from 'svelte/store';

	interface Props {
		operationStore: Readable<OnchainOperation | undefined>;
	}

	let {operationStore}: Props = $props();

	// Helper to get status info
	function getStatusInfo(intent: TransactionIntent): {
		label: string;
		variant: 'default' | 'secondary' | 'destructive' | 'outline';
		icon: typeof CircleCheckIcon;
	} {
		const state = intent.state;

		if (!state || state.inclusion === 'InMemPool') {
			return {label: 'Pending', variant: 'secondary', icon: ClockIcon};
		}

		if (state.inclusion === 'NotFound') {
			return {
				label: 'Not Found',
				variant: 'destructive',
				icon: CircleQuestionMarkIcon,
			};
		}

		if (state.inclusion === 'Dropped') {
			return {
				label: 'Dropped',
				variant: 'destructive',
				icon: TriangleAlertIcon,
			};
		}

		if (state.inclusion === 'Included') {
			if (state.status === 'Success') {
				return {label: 'Success', variant: 'default', icon: CircleCheckIcon};
			} else {
				return {label: 'Failed', variant: 'destructive', icon: CircleXIcon};
			}
		}

		return {label: 'Unknown', variant: 'outline', icon: CircleQuestionMarkIcon};
	}

	// Get operation name from metadata
	function getOperationName(op: OnchainOperation): string {
		const metadata = op.metadata;
		if (metadata.type === 'functionCall') {
			return metadata.functionName;
		}
		if (metadata.type === 'unknown') {
			return metadata.name;
		}
		return 'Unknown';
	}
</script>

{#if $operationStore}
	{@const statusInfo = getStatusInfo($operationStore.transactionIntent)}
	{@const StatusIcon = statusInfo.icon}
	{@const state = $operationStore.transactionIntent.state}
	<div class="flex items-center justify-between gap-2 px-2 py-1 text-xs">
		<div class="flex min-w-0 items-center gap-1.5">
			<StatusIcon class="h-3 w-3 shrink-0" />
			<span class="truncate">{getOperationName($operationStore)}</span>
		</div>
		<div class="flex items-center gap-1">
			{#if state?.final !== undefined}
				<Badge
					variant="outline"
					class="h-4 shrink-0 px-1.5 py-0 text-[10px]"
				>
					Final
				</Badge>
			{/if}
			<Badge
				variant={statusInfo.variant}
				class="h-4 shrink-0 px-1.5 py-0 text-[10px]"
			>
				{statusInfo.label}
			</Badge>
		</div>
	</div>
{/if}
