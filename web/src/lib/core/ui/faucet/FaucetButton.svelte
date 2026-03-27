<script lang="ts">
	import {PUBLIC_FAUCET_LINK} from '$env/static/public';
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	function openFaucet() {
		window.open(PUBLIC_FAUCET_LINK, 'faucet', 'width=600,height=700,scrollbars=yes,resizable=yes');
	}
</script>

<Button variant="outline" onclick={openFaucet} class="w-full gap-2">
	<ExternalLinkIcon class="h-4 w-4" />
	Get Test ETH
</Button>
