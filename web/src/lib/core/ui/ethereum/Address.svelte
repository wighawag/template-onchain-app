<script lang="ts">
	import {CheckIcon, CopyIcon, LoaderCircleIcon} from '@lucide/svelte';
	import {getContext, onMount} from 'svelte';
	import {type HTMLAttributes} from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		value: `0x${string}`;
		start?: number;
		end?: number;
	}
	let {value, start = 4, end = 4, ...restProps}: Props = $props();

	// Get ENS context if available - component works without it
	const ensContext = getContext<
		{fetchENS: (address: `0x${string}`) => Promise<string | null>} | undefined
	>('ens');

	let ensName: string | null = $state(null);
	let loading = $state(false);
	let copied = $state(false);

	onMount(() => {
		if (value && ensContext) {
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

	function formatAddress(addr: string) {
		if (!addr) return '';
		return `${addr.slice(0, start)}...${addr.slice(-end)}`;
	}

	async function copyAddress(event: MouseEvent) {
		event.stopPropagation();
		await navigator.clipboard.writeText(value);
		copied = true;
		setTimeout(() => (copied = false), 1000);
	}
</script>

<span {...restProps} class="inline-flex w-full min-w-[8em] items-center">
	<span class="flex-1"></span>
	<span class="group relative flex-0 text-center">
		{#if ensName}
			{ensName}
		{:else}
			{formatAddress(value)}
		{/if}
		<!-- {#if !loading} -->
		<button
			type="button"
			class="absolute top-1/2 right-[-1.5em] -translate-y-1/2 cursor-copy rounded p-0.5 transition"
			title="Copy address"
			onclick={copyAddress}
			aria-label="Copy address"
			style="margin-left:0.25em;"
		>
			<span
				class="absolute top-1/2 right-0 size-8 -translate-y-1/2 pointer-fine:hidden"
			></span>
			<span
				class="absolute top-1/2 right-0 size-5 -translate-y-1/2 pointer-coarse:hidden"
			></span>
			{#if copied}
				<CheckIcon class="h-3 w-3 text-green-500" />
			{:else}
				<CopyIcon class="h-3 w-3" />
			{/if}
		</button>
		<!-- {/if} -->
	</span>
	<span class="flex flex-1 items-center justify-end gap-1">
		{#if loading}
			<LoaderCircleIcon class="w-4 animate-spin" />
		{/if}
	</span>
</span>
