<script lang="ts">
	import {Blockie} from '$lib/core/utils/ethereum/blockie';
	import * as Avatar from '$lib/shadcn/ui/avatar';
	import * as Popover from '$lib/shadcn/ui/popover';
	import Address from './Address.svelte';
	import type {HTMLImgAttributes} from 'svelte/elements';
	import {getContext} from 'svelte';
	import {untrack} from 'svelte';
	import type {ENSContext} from '$lib/core/ens';

	interface EthereumAvatarProps extends HTMLImgAttributes {
		address: `0x${string}`;
		offset?: number;
		showAddressOnTap?: boolean;
	}

	let {
		address,
		offset = 0,
		showAddressOnTap = false,
		...restProps
	}: EthereumAvatarProps = $props();

	let blockieUri = $derived(Blockie.getURI(address, offset));

	// ENS context for resolving names and avatars
	const ensContext = getContext<ENSContext | undefined>('ens');

	let ensName: string | null = $state(null);
	let ensAvatar: string | null = $state(null);
	let ensNameLoading = $state(false);
	let ensAvatarLoading = $state(false);
	let ensAttempted = false; // non-reactive flag to prevent re-triggering
	let avatarAttempted = false; // non-reactive flag for avatar loading
	let popoverOpen = $state(false);

	// Compute the avatar URI - use ENS avatar if available, fallback to blockie
	let avatarUri = $derived(ensAvatar || blockieUri);
	let isBlockie = $derived(!ensAvatar);

	// Initialize from cache and load ENS avatar when address changes
	$effect(() => {
		// Track address to trigger this effect
		const currentAddress = address;

		// Reset state for new address
		avatarAttempted = false;
		ensAttempted = false;

		if (!ensContext || !currentAddress) {
			ensAvatar = null;
			ensName = null;
			return;
		}

		// Check cache synchronously first - no blink for cached avatars
		const cachedAvatarState = ensContext.getENSAvatarState(currentAddress);
		if (cachedAvatarState.avatar) {
			ensAvatar = cachedAvatarState.avatar;
			avatarAttempted = true;
		} else if (!cachedAvatarState.loading) {
			// Not cached and not loading - start fetch
			ensAvatar = null;
			avatarAttempted = true;
			loadENSAvatar(currentAddress);
		}

		// Also check cached ENS name
		const cachedNameState = ensContext.getENSState(currentAddress);
		if (cachedNameState.name) {
			ensName = cachedNameState.name;
			ensAttempted = true;
		} else {
			ensName = null;
		}
	});

	// Load ENS name when popover opens (if not already loaded)
	$effect(() => {
		if (popoverOpen && showAddressOnTap && ensContext) {
			// Use untrack to prevent re-triggering when ensName/ensNameLoading change
			untrack(() => {
				if (!ensAttempted && address) {
					ensAttempted = true;
					loadENSName(address);
				}
			});
		}
	});

	async function loadENSAvatar(addr: `0x${string}`) {
		if (!ensContext) {
			return;
		}
		ensAvatarLoading = true;
		try {
			const result = await ensContext.fetchENSAvatar(addr);
			// Only update if address hasn't changed
			if (addr === address) {
				ensAvatar = result;
			}
		} finally {
			if (addr === address) {
				ensAvatarLoading = false;
			}
		}
	}

	async function loadENSName(addr: `0x${string}`) {
		if (!ensContext) {
			return;
		}
		ensNameLoading = true;
		try {
			const result = await ensContext.fetchENS(addr);
			// Only update if address hasn't changed
			if (addr === address) {
				ensName = result;
			}
		} finally {
			if (addr === address) {
				ensNameLoading = false;
			}
		}
	}

	const blockieImageStyle =
		'image-rendering: -moz-crisp-edges; image-rendering: -webkit-crisp-edges; image-rendering: crisp-edges; image-rendering: pixelated;';
</script>

{#if showAddressOnTap}
	<Popover.Root bind:open={popoverOpen}>
		<Popover.Trigger class="cursor-pointer rounded-full focus:outline-none">
			<Avatar.Root>
				{#if ensAvatarLoading}
					<!-- Show blockie while loading ENS avatar -->
					<Avatar.AvatarImage
						src={blockieUri}
						alt={address}
						style={blockieImageStyle}
					/>
				{:else}
					<Avatar.AvatarImage
						src={avatarUri}
						alt={address}
						style={isBlockie ? blockieImageStyle : undefined}
					/>
				{/if}
			</Avatar.Root>
		</Popover.Trigger>
		<Popover.Content
			class="w-auto min-w-64 border border-muted bg-popover p-4 text-popover-foreground shadow-xl shadow-black/25"
			side="top"
			sideOffset={8}
			collisionPadding={16}
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
			<Popover.Arrow class="ethereum-avatar-popover-arrow" />
			<div class="flex items-center gap-3">
				<!-- Larger avatar in the popover -->
				<Avatar.Root class="size-12 ring-2 ring-border">
					<Avatar.AvatarImage
						src={avatarUri}
						alt={address}
						style={isBlockie ? blockieImageStyle : undefined}
					/>
				</Avatar.Root>
				<div class="flex min-w-0 flex-col justify-center gap-1">
					{#if ensNameLoading}
						<div class="h-5 w-24 animate-pulse rounded bg-muted"></div>
					{:else if ensName}
						<span class="truncate font-semibold text-foreground">{ensName}</span>
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
		{#if ensAvatarLoading}
			<!-- Show blockie while loading ENS avatar -->
			<Avatar.AvatarImage
				src={blockieUri}
				alt={address}
				style={blockieImageStyle}
			/>
		{:else}
			<Avatar.AvatarImage
				src={avatarUri}
				alt={address}
				style={isBlockie ? blockieImageStyle : undefined}
			/>
		{/if}
	</Avatar.Root>
{/if}

<style>
	:global(.ethereum-avatar-popover-arrow) {
		fill: var(--muted) !important;
	}
	:global(.ethereum-avatar-popover-arrow svg) {
		fill: var(--muted) !important;
	}
	:global(.ethereum-avatar-popover-arrow polygon) {
		fill: var(--muted) !important;
	}
</style>
