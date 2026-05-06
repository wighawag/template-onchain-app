<script lang="ts">
	import * as Modal from '$lib/core/ui/modal/index.js';
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import {Spinner} from '$lib/shadcn/ui/spinner/index.js';
	import {balanceCheckStore} from './balance-check-store';
	import {formatBalance} from '$lib/core/utils/format/balance';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import {FaucetButton, hasFaucet} from '$lib/core/ui/faucet/index.js';
	import {deployments} from '$lib/deployments-store';

	const state = balanceCheckStore;

	let isOpen = $derived($state.step !== 'idle');

	// Get the current balance value reactively by subscribing to the balance store
	// We need to use $ on the store itself to get its value
	let balanceStoreRef = $derived.by(() =>
		$state.step === 'insufficient' ? $state.balanceStore : null,
	);
	let currentBalance = $derived(balanceStoreRef ? $balanceStoreRef : null);

	// Calculate if we now have sufficient funds
	let hasSufficientFunds = $derived(
		$state.step === 'insufficient' &&
			currentBalance?.step === 'Loaded' &&
			currentBalance.value >= $state.estimatedCost,
	);

	// Display balance (live value)
	let displayBalance = $derived(
		currentBalance?.step === 'Loaded' ? currentBalance.value : 0n,
	);

	// Check if waiting for balance update after faucet claim
	let isWaitingForBalanceUpdate = $derived(
		$state.step === 'insufficient' && $state.isWaitingForBalanceUpdate === true,
	);

	// Calculate shortfall reactively
	let shortfall = $derived(
		$state.step === 'insufficient'
			? $state.estimatedCost > displayBalance
				? $state.estimatedCost - displayBalance
				: 0n
			: 0n,
	);
</script>

<Modal.Root
	openWhen={isOpen}
	onCancel={() => $state.step === 'insufficient' && $state.onDismiss?.()}
>
	{#if $state.step === 'estimating'}
		<Modal.Title>Preparing Transaction</Modal.Title>
		<div class="flex flex-col items-center gap-4 py-8">
			<Spinner class="h-10 w-10" />
			<p class="text-muted-foreground">Estimating transaction cost...</p>
		</div>
	{:else if $state.step === 'insufficient'}
		<Modal.Title>
			{#if hasSufficientFunds}
				<span class="flex items-center gap-2 text-green-600">
					<CircleCheckIcon class="h-5 w-5" />
					Funds Available
				</span>
			{:else}
				<span class="flex items-center gap-2 text-destructive">
					<AlertTriangleIcon class="h-5 w-5" />
					Insufficient Funds
				</span>
			{/if}
		</Modal.Title>

		<div class="space-y-4 py-4">
			{#if hasSufficientFunds}
				<p class="text-muted-foreground">
					You now have enough funds to complete this transaction.
				</p>
			{:else if $state.isWaitingForBalanceUpdate}
				<p class="flex items-center gap-2 text-muted-foreground">
					<Spinner class="h-4 w-4" />
					Waiting for balance update...
				</p>
			{:else}
				<p class="text-muted-foreground">
					You don't have enough funds to complete this transaction.
				</p>
			{/if}

			<div class="space-y-2 rounded-lg bg-muted p-4">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Your balance:</span>
					<span class="font-mono"
						>{formatBalance(displayBalance)}
						{$deployments.chain.nativeCurrency.symbol}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Estimated cost:</span>
					<span class="font-mono"
						>{formatBalance($state.estimatedCost)}
						{$deployments.chain.nativeCurrency.symbol}</span
					>
				</div>
				{#if !hasSufficientFunds}
					<hr class="border-border" />
					<div class="flex justify-between text-destructive">
						<span>Shortfall:</span>
						<span class="font-mono"
							>{formatBalance(shortfall)}
							{$deployments.chain.nativeCurrency.symbol}</span
						>
					</div>
				{/if}
			</div>

			{#if !hasSufficientFunds && !isWaitingForBalanceUpdate && hasFaucet}
				<FaucetButton />
			{/if}
		</div>

		<Modal.Footer>
			{#if hasSufficientFunds}
				<Button onclick={$state.onContinue} class="w-full">
					Continue Transaction
				</Button>
			{:else}
				<Button variant="outline" onclick={$state.onDismiss}>Dismiss</Button>
			{/if}
		</Modal.Footer>
	{/if}
</Modal.Root>
