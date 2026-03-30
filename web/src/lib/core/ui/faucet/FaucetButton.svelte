<script lang="ts">
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import {getUserContext} from '$lib';
	import {claimFund} from 'faucet-client';
	import {PUBLIC_FAUCET_LINK} from '$env/static/public';

	const {account, deployments} = getUserContext();

	let status = $state<'idle' | 'pending' | 'success' | 'error'>('idle');

	async function openFaucet() {
		const address = $account;
		if (!address) {
			throw new Error(`no account for faucet`);
		}

		status = 'pending';
		try {
			await claimFund(
				{
					faucetUrl: PUBLIC_FAUCET_LINK,
					chainId: deployments.current.chain.id,
					address,
				},
				{
					width: 600,
					height: 700,
				},
			);
			status = 'success';
		} catch {
			status = 'error';
			setTimeout(() => {
				status = 'idle';
			}, 2000);
		}
	}
</script>

<Button
	variant="outline"
	onclick={openFaucet}
	disabled={status === 'pending' || status === 'success'}
	class="w-full gap-2"
>
	{#if status === 'pending'}
		<LoaderIcon class="h-4 w-4 animate-spin" />
	{:else if status === 'success'}
		<CircleCheckIcon class="h-4 w-4 text-green-500" />
	{:else if status === 'error'}
		<CircleXIcon class="h-4 w-4 text-red-500" />
	{:else}
		<ExternalLinkIcon class="h-4 w-4" />
	{/if}
	Get {deployments.current.chain.nativeCurrency.symbol}
</Button>
