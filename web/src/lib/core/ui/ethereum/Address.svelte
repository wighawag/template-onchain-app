<script lang="ts" module>
	import {cn} from '$lib/shadcn/utils.js';
	import type {HTMLAttributes} from 'svelte/elements';
	import {type VariantProps, tv} from 'tailwind-variants';

	export const addressVariants = tv({
		base: 'inline-flex items-center gap-1',
		variants: {
			size: {
				xs: 'text-xs',
				sm: 'text-sm',
				default: 'text-base',
				lg: 'text-lg',
			},
			mono: {
				true: 'font-mono',
				false: '',
			},
		},
		defaultVariants: {
			size: 'default',
			mono: false,
		},
	});

	export type AddressSize = VariantProps<typeof addressVariants>['size'];

	export interface AddressProps extends HTMLAttributes<HTMLSpanElement> {
		value: `0x${string}`;
		truncate?: {start: number; end: number} | false;
		size?: AddressSize;
		mono?: boolean;
		showCopy?: boolean;
		resolveENS?: boolean;
		linkTo?: 'internal' | 'external' | 'both' | 'auto' | false;
		ref?: HTMLSpanElement | null;
	}
</script>

<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import {getContext, onMount} from 'svelte';
	import {route} from '$lib';
	import {
		getBlockExplorerAddressUrl,
		hasBlockExplorer,
		resolveLinkTo,
	} from '$lib/core/utils/ethereum/blockExplorer';

	let {
		class: className,
		value,
		truncate = {start: 4, end: 4},
		size = 'default',
		mono = false,
		showCopy = true,
		resolveENS = true,
		linkTo = false,
		ref = $bindable(null),
		...restProps
	}: AddressProps = $props();

	// Get ENS context if available - component works without it
	const ensContext = getContext<
		{fetchENS: (address: `0x${string}`) => Promise<string | null>} | undefined
	>('ens');

	let ensName: string | null = $state(null);
	let loading = $state(false);
	let copied = $state(false);

	onMount(() => {
		if (value && ensContext && resolveENS) {
			loadENS();
		}
	});

	async function loadENS() {
		if (!value || !ensContext) {
			return;
		}
		loading = true;
		ensName = null;
		try {
			ensName = await ensContext.fetchENS(value);
		} finally {
			loading = false;
		}
	}

	function formatAddress(addr: string): string {
		if (!addr) return '';
		if (truncate === false) return addr;
		return `${addr.slice(0, 2 + truncate.start)}...${addr.slice(-truncate.end)}`;
	}

	async function copyAddress(event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();
		await navigator.clipboard.writeText(value);
		copied = true;
		setTimeout(() => (copied = false), 1000);
	}

	const displayText = $derived(ensName || formatAddress(value));
	const internalUrl = $derived(route(`/explorer/address/${value}`));
	const externalUrl = $derived(getBlockExplorerAddressUrl(value));
	const resolvedLinkTo = $derived(resolveLinkTo(linkTo));
	// When internal is available (internal or both), text links to internal
	const showInternalLink = $derived(
		resolvedLinkTo === 'internal' || resolvedLinkTo === 'both',
	);
	// When external-only, text links directly to external (no icon)
	const showExternalAsTextLink = $derived(
		resolvedLinkTo === 'external' && hasBlockExplorer(),
	);
	// When both, show external icon as secondary action
	const showExternalIcon = $derived(
		resolvedLinkTo === 'both' && hasBlockExplorer(),
	);
</script>

<span
	bind:this={ref}
	data-slot="address"
	class={cn(addressVariants({size, mono}), className)}
	{...restProps}
>
	{#if showInternalLink}
		<a
			href={internalUrl}
			data-slot="address-link"
			class="text-primary hover:underline"
		>
			{displayText}
		</a>
	{:else if showExternalAsTextLink && externalUrl}
		<a
			href={externalUrl}
			target="_blank"
			rel="noopener noreferrer"
			data-slot="address-link"
			class="text-primary hover:underline"
		>
			{displayText}
		</a>
	{:else}
		<span data-slot="address-text">{displayText}</span>
	{/if}

	{#if loading}
		<LoaderCircleIcon class="size-3 shrink-0 animate-spin opacity-50" />
	{/if}

	{#if showCopy}
		<button
			type="button"
			class="inline-flex size-4 shrink-0 cursor-copy items-center justify-center rounded opacity-50 transition-opacity hover:opacity-100 focus:opacity-100"
			title="Copy address"
			onclick={copyAddress}
			aria-label="Copy address"
		>
			{#if copied}
				<CheckIcon class="size-3 text-green-500" />
			{:else}
				<CopyIcon class="size-3" />
			{/if}
		</button>
	{/if}

	{#if showExternalIcon && externalUrl}
		<a
			href={externalUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex size-4 shrink-0 items-center justify-center rounded opacity-50 transition-opacity hover:opacity-100 focus:opacity-100"
			title="View in block explorer"
			aria-label="View in block explorer"
		>
			<ExternalLinkIcon class="size-3" />
		</a>
	{/if}
</span>
