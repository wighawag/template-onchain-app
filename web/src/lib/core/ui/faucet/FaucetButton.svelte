<script lang="ts">
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LoaderIcon from '@lucide/svelte/icons/loader';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import {getUserContext} from '$lib';
	import {claimFund} from 'faucet-client';
	import {PUBLIC_FAUCET_LINK, PUBLIC_FAUCET_API} from '$env/static/public';

	const {account, balance, deployments, publicClient} = getUserContext();

	let status = $state<'idle' | 'pending' | 'success' | 'error'>('idle');

	async function claimViaApi(
		address: `0x${string}`,
		chainId: number,
	): Promise<void> {
		// The faucet API expects POST /api/claim with JSON body {token, chainId, address}
		// When captcha is disabled on server (DISABLE_CAPTCHA=true), token can be any value
		const url = PUBLIC_FAUCET_API.endsWith('/')
			? `${PUBLIC_FAUCET_API}api/claim`
			: `${PUBLIC_FAUCET_API}/api/claim`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				token: 'direct-api-call', // Dummy token for captcha-disabled mode
				chainId: String(chainId),
				address,
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			throw new Error(`Faucet API error: ${data.error || response.statusText}`);
		}

		const txHash = data.txHash as `0x${string}`;

		if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
			throw new Error('Invalid txHash returned from faucet API');
		}

		// Wait for the transaction to be included
		await publicClient.waitForTransactionReceipt({hash: txHash});
	}

	async function openFaucet() {
		const address = $account;
		if (!address) {
			throw new Error(`no account for faucet`);
		}

		status = 'pending';
		try {
			if (PUBLIC_FAUCET_API && PUBLIC_FAUCET_API.trim()) {
				// Use direct API call instead of popup
				await claimViaApi(address, $deployments.chain.id);
			} else {
				// Use popup flow
				await claimFund(
					{
						faucetUrl: PUBLIC_FAUCET_LINK,
						chainId: $deployments.chain.id,
						address,
					},
					{
						width: 600,
						height: 700,
					},
				);
			}
			status = 'success';
			// Trigger immediate balance refresh so modal updates
			balance.update();
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
	Get {$deployments.chain.nativeCurrency.symbol}
</Button>
