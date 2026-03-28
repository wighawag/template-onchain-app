<script lang="ts">
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import {getFaucetLink} from '.';
	import {getUserContext} from '$lib';

	const {account} = getUserContext();

	function openFaucet() {
		const address = $account;
		if (!address) {
			throw new Error(`no account for faucet`);
		}
		window.open(
			getFaucetLink(address),
			'faucet',
			'width=600,height=700,scrollbars=yes,resizable=yes',
		);
	}
</script>

<Button variant="outline" onclick={openFaucet} class="w-full gap-2">
	<ExternalLinkIcon class="h-4 w-4" />
	Get Test ETH
</Button>
