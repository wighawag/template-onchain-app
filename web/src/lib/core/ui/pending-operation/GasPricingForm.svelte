<script lang="ts">
	import * as Modal from '$lib/core/ui/modal/index.js';
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import {getUserContext} from '$lib';
	import {formatGwei, parseGwei} from 'viem';
	import type {GasPrice} from '$lib/core/connection/gasFee';

	interface Props {
		open: boolean;
		onSubmit: (gasPrice: GasPrice) => void;
		onCancel: () => void;
		isSubmitting?: boolean;
		currentGasPrice?: bigint;
		errorMessage?: string | null;
	}

	let {
		open,
		onSubmit,
		onCancel,
		isSubmitting = false,
		currentGasPrice,
		errorMessage = null,
	}: Props = $props();

	const {gasFee} = getUserContext();

	type GasOption = 'slow' | 'average' | 'fast' | 'custom';
	let selectedOption = $state<GasOption>('fast');
	let customGasPrice = $state('');

	// Get current gas prices
	let gasFeeValue = $derived($gasFee);
	let isLoaded = $derived(gasFeeValue.step === 'Loaded');

	// Format gas prices for display
	let gasPrices = $derived.by(() => {
		if (gasFeeValue.step !== 'Loaded') return null;
		return {
			slow: gasFeeValue.slow,
			average: gasFeeValue.average,
			fast: gasFeeValue.fast,
		};
	});

	// Get selected gas price
	let selectedGasPrice = $derived.by((): GasPrice | null => {
		if (selectedOption === 'custom') {
			try {
				const gwei = parseGwei(customGasPrice);
				return {maxFeePerGas: gwei, maxPriorityFeePerGas: gwei};
			} catch {
				return null;
			}
		}
		if (!gasPrices) return null;
		return gasPrices[selectedOption];
	});

	function handleSubmit() {
		if (selectedGasPrice) {
			onSubmit(selectedGasPrice);
		}
	}

	function formatGas(price: GasPrice): string {
		return `${formatGwei(price.maxFeePerGas)} gwei`;
	}
</script>

<Modal.Root openWhen={open} {onCancel}>
	<Modal.Title>Resubmit Transaction</Modal.Title>

	<div class="space-y-4 py-4">
		<p class="text-sm text-muted-foreground">
			Select gas price for the transaction. A higher gas price increases the
			chance of the transaction being included in a block.
		</p>

		{#if currentGasPrice}
			<div class="rounded-md border bg-muted/30 p-3 text-sm">
				<span class="text-muted-foreground">Current gas price:</span>
				<span class="ml-2 font-mono">{formatGwei(currentGasPrice)} gwei</span>
			</div>
		{/if}

		{#if isLoaded && gasPrices}
			<div class="grid grid-cols-3 gap-2">
				<button
					type="button"
					class="flex flex-col items-center rounded-lg border p-3 transition-colors {selectedOption ===
					'slow'
						? 'border-primary bg-primary/10'
						: 'hover:bg-muted/50'}"
					onclick={() => (selectedOption = 'slow')}
				>
					<span class="text-sm font-medium">Slow</span>
					<span class="mt-1 text-xs text-muted-foreground"
						>{formatGas(gasPrices.slow)}</span
					>
				</button>
				<button
					type="button"
					class="flex flex-col items-center rounded-lg border p-3 transition-colors {selectedOption ===
					'average'
						? 'border-primary bg-primary/10'
						: 'hover:bg-muted/50'}"
					onclick={() => (selectedOption = 'average')}
				>
					<span class="text-sm font-medium">Average</span>
					<span class="mt-1 text-xs text-muted-foreground"
						>{formatGas(gasPrices.average)}</span
					>
				</button>
				<button
					type="button"
					class="flex flex-col items-center rounded-lg border p-3 transition-colors {selectedOption ===
					'fast'
						? 'border-primary bg-primary/10'
						: 'hover:bg-muted/50'}"
					onclick={() => (selectedOption = 'fast')}
				>
					<span class="text-sm font-medium">Fast</span>
					<span class="mt-1 text-xs text-muted-foreground"
						>{formatGas(gasPrices.fast)}</span
					>
				</button>
			</div>
		{:else}
			<div class="flex items-center justify-center py-4">
				<span class="text-sm text-muted-foreground">Loading gas prices...</span>
			</div>
		{/if}

		<div class="space-y-2">
			<label class="flex items-center gap-2 text-sm">
				<input
					type="radio"
					name="gas-option"
					checked={selectedOption === 'custom'}
					onchange={() => (selectedOption = 'custom')}
					class="size-4"
				/>
				<span>Custom</span>
			</label>
			{#if selectedOption === 'custom'}
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={customGasPrice}
						placeholder="Enter gas price"
						class="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
					/>
					<span class="text-sm text-muted-foreground">gwei</span>
				</div>
			{/if}
		</div>

		{#if selectedGasPrice}
			<div class="rounded-md border bg-muted/30 p-3 text-sm">
				<span class="text-muted-foreground">New gas price:</span>
				<span class="ml-2 font-mono font-medium"
					>{formatGas(selectedGasPrice)}</span
				>
			</div>
		{/if}

		{#if errorMessage}
			<div
				class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
			>
				{errorMessage}
			</div>
		{/if}
	</div>

	<Modal.Footer>
		<Button variant="outline" onclick={onCancel} disabled={isSubmitting}>
			Cancel
		</Button>
		<Button onclick={handleSubmit} disabled={!selectedGasPrice || isSubmitting}>
			{#if isSubmitting}
				Submitting...
			{:else}
				Resubmit
			{/if}
		</Button>
	</Modal.Footer>
</Modal.Root>
