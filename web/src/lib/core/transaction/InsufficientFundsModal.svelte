<script lang="ts">
	import * as Modal from '$lib/core/ui/modal/index.js';
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import {balanceCheckStore} from './balance-check-store';
	import {formatBalance} from '$lib/core/utils/format/balance';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import {FaucetButton, hasFaucetLink} from '$lib/core/ui/faucet/index.js';

	const state = balanceCheckStore;

	let isOpen = $derived($state.step !== 'idle');
</script>

<Modal.Root openWhen={isOpen}>
	{#if $state.step === 'estimating'}
		<Modal.Title>Preparing Transaction</Modal.Title>
		<div class="flex flex-col items-center gap-4 py-8">
			<Spinner class="h-10 w-10" />
			<p class="text-muted-foreground">Estimating transaction cost...</p>
		</div>
	{:else if $state.step === 'insufficient'}
		<Modal.Title>
			<span class="flex items-center gap-2 text-destructive">
				<AlertTriangleIcon class="h-5 w-5" />
				Insufficient Funds
			</span>
		</Modal.Title>

		<div class="space-y-4 py-4">
			<p class="text-muted-foreground">
				You don't have enough funds to complete this transaction.
			</p>

			<div class="space-y-2 rounded-lg bg-muted p-4">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Your balance:</span>
					<span class="font-mono">{formatBalance($state.balance)} ETH</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Estimated cost:</span>
					<span class="font-mono">{formatBalance($state.estimatedCost)} ETH</span>
				</div>
				<hr class="border-border" />
				<div class="flex justify-between text-destructive">
					<span>Shortfall:</span>
					<span class="font-mono">{formatBalance($state.shortfall)} ETH</span>
				</div>
			</div>

			{#if hasFaucetLink}
				<FaucetButton />
			{/if}
		</div>

		<Modal.Footer>
			<Button onclick={$state.onDismiss}>Dismiss</Button>
		</Modal.Footer>
	{/if}
</Modal.Root>
