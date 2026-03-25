<script lang="ts">
	import {Blockie} from '$lib/core/utils/ethereum/blockie';
	import * as Avatar from '$lib/shadcn/ui/avatar';
	import * as Popover from '$lib/shadcn/ui/popover';
	import Address from './Address.svelte';
	import type {HTMLImgAttributes} from 'svelte/elements';
	import {getContext} from 'svelte';
	import {untrack} from 'svelte';

	interface BlockieProps extends HTMLImgAttributes {
		address: `0x${string}`;
		offset?: number;
		showAddressOnTap?: boolean;
	}

	let {
		address,
		offset = 0,
		showAddressOnTap = false,
		...restProps
	}: BlockieProps = $props();

	let uri = $derived(Blockie.getURI(address, offset));

	// ENS context for resolving names
	const ensContext = getContext<
		{fetchENS: (address: `0x${string}`) => Promise<string | null>} | undefined
	>('ens');

	let ensName: string | null = $state(null);
	let ensLoading = $state(false);
	let ensAttempted = false; // non-reactive flag to prevent re-triggering
	let popoverOpen = $state(false);

	// Load ENS when popover opens
	$effect(() => {
		if (popoverOpen && showAddressOnTap && ensContext) {
			// Use untrack to prevent re-triggering when ensName/ensLoading change
			untrack(() => {
				if (!ensAttempted) {
					ensAttempted = true;
					loadENS();
				}
			});
		}
	});

	async function loadENS() {
		if (!address || !ensContext) {
			return;
		}
		ensLoading = true;
		try {
			ensName = await ensContext.fetchENS(address);
		} finally {
			ensLoading = false;
		}
	}

	const blockieImageStyle =
		'image-rendering: -moz-crisp-edges; image-rendering: -webkit-crisp-edges; image-rendering: crisp-edges; image-rendering: pixelated;';
</script>

{#if showAddressOnTap}
	<Popover.Root bind:open={popoverOpen}>
		<Popover.Trigger class="cursor-pointer rounded-full focus:outline-none">
			<Avatar.Root>
				<Avatar.AvatarImage src={uri} alt={address} style={blockieImageStyle} />
			</Avatar.Root>
		</Popover.Trigger>
		<Popover.Content
			class="w-auto min-w-64 p-4"
			side="top"
			interactOutsideBehavior="defer-otherwise-close"
			onInteractOutside={(e) => {
				const target = e.target as HTMLElement;
				// Check if the target is a popover trigger - let defer-otherwise-close handle it
				const isPopoverTrigger = target?.closest(
					'[data-slot="popover-trigger"]',
				);
				if (!isPopoverTrigger && target) {
					// For non-popover elements, re-dispatch the click after a tick
					setTimeout(() => {
						target.click();
						if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
							target.focus();
						}
					}, 0);
				}
			}}
		>
			<div class="flex items-center gap-3">
				<!-- Larger blockie avatar in the popover -->
				<Avatar.Root class="size-12">
					<Avatar.AvatarImage
						src={uri}
						alt={address}
						style={blockieImageStyle}
					/>
				</Avatar.Root>
				<div class="flex min-w-0 flex-col justify-center gap-1">
					{#if ensLoading}
						<div class="h-5 w-24 animate-pulse rounded bg-muted"></div>
					{:else if ensName}
						<span class="truncate font-semibold text-foreground">{ensName}</span
						>
					{/if}
					<Address
						value={address}
						resolveENS={false}
						size="sm"
						mono={true}
						class="text-muted-foreground"
						linkTo="auto"
					/>
				</div>
			</div>
		</Popover.Content>
	</Popover.Root>
{:else}
	<Avatar.Root>
		<Avatar.AvatarImage src={uri} alt={address} style={blockieImageStyle} />
	</Avatar.Root>
{/if}
