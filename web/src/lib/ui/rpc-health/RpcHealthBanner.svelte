<script lang="ts">
	import {getUserContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';

	const {connection, rpcHealth, offline} = getUserContext();

	let isConnected = $derived(connection.isTargetStepReached($connection));

	function errorLabel(category: string): string {
		switch (category) {
			case 'timeout':
				return 'RPC endpoint is timing out';
			case 'rate-limit':
				return 'RPC rate limit exceeded';
			case 'server-error':
				return 'RPC server error';
			case 'network':
				return 'Cannot reach RPC endpoint';
			default:
				return 'RPC connection issue';
		}
	}
</script>

{#if !$rpcHealth.healthy && $rpcHealth.error && !$offline.offline}
	<div
		class="sticky top-12 z-40 flex w-full items-center justify-between gap-3 border-b border-amber-900 bg-amber-950 px-4 py-2"
	>
		<div class="flex items-center gap-2">
			<WifiOffIcon class="h-4 w-4 shrink-0 text-amber-400" />
			<span class="text-sm text-amber-400">
				{errorLabel($rpcHealth.error.category)}
				— data may be stale.
				{#if !isConnected}
					Connecting your wallet may resolve this.
				{/if}
			</span>
		</div>
		{#if !isConnected}
			<Button
				variant="outline"
				size="sm"
				class="shrink-0 border-amber-700 text-amber-400 hover:bg-amber-900"
				onclick={() => connection.connect()}
			>
				Connect Wallet
			</Button>
		{/if}
	</div>
{/if}
