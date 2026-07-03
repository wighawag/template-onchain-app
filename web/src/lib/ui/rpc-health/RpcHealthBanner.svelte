<script lang="ts">
	import {getAppContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';

	const {connection, rpcHealth, offline, hasAppRpc, refreshChainData} =
		getAppContext();

	let isConnected = $derived(connection.isTargetStepReached($connection));

	// Whether the connection has settled (finished its initial auto-connect
	// attempt). While still connecting we don't yet know if the user has a wallet,
	// so we must not flash the "no RPC" banner. Mirrors the navbar's connect-button
	// gating.
	let connectionSettled = $derived(
		!(
			($connection.step === 'Idle' && $connection.loading) ||
			($connection.step !== 'Idle' && !connection.isTargetStepReached($connection))
		),
	);

	// No app RPC + settled-as-disconnected: the app has no way to read the chain.
	// This is expected (connect the wallet to load data), NOT a failing RPC, so
	// show a distinct informational banner and suppress the failing-RPC warning.
	// Gated on `connectionSettled` so it does not blink during initial connect.
	let noRpcYet = $derived(!hasAppRpc && connectionSettled && !isConnected);

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

{#if noRpcYet && !$offline.offline}
	<div
		class="sticky top-12 z-40 flex w-full items-center justify-between gap-3 border-b border-sky-900 bg-sky-950 px-4 py-2"
	>
		<div class="flex items-center gap-2">
			<WifiOffIcon class="h-4 w-4 shrink-0 text-sky-400" />
			<span class="text-sm text-sky-400">
				No RPC configured — connect your wallet to load onchain data.
			</span>
		</div>
		<Button
			variant="outline"
			size="sm"
			class="shrink-0 border-sky-700 text-sky-400 hover:bg-sky-900"
			onclick={() => connection.connect()}
		>
			Connect Wallet
		</Button>
	</div>
{:else if !$rpcHealth.healthy && $rpcHealth.error && !$offline.offline}
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
		<div class="flex shrink-0 items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				class="border-amber-700 text-amber-400 hover:bg-amber-900"
				onclick={() => refreshChainData()}
			>
				Retry
			</Button>
			{#if !isConnected}
				<Button
					variant="outline"
					size="sm"
					class="border-amber-700 text-amber-400 hover:bg-amber-900"
					onclick={() => connection.connect()}
				>
					Connect Wallet
				</Button>
			{/if}
		</div>
	</div>
{/if}
