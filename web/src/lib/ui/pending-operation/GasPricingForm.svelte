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
		minGasPrice?: GasPrice;
		errorMessage?: string | null;
	}

	let {
		open,
		onSubmit,
		onCancel,
		isSubmitting = false,
		minGasPrice,
		errorMessage = null,
	}: Props = $props();

	const {gasFee} = getUserContext();

	type GasOption = 'slow' | 'average' | 'fast' | 'custom';
	let selectedOption = $state<GasOption>('fast');
	let customGasPrice = $state('');

	// Get current gas prices
	let gasFeeValue = $derived($gasFee);
	let isLoaded = $derived(gasFeeValue.step === 'Loaded');

	// Helper to enforce minimum on a gas price
	function enforceMinimum(price: GasPrice): GasPrice {
		if (!minGasPrice) return price;
		return {
			maxFeePerGas:
				price.maxFeePerGas >= minGasPrice.maxFeePerGas
					? price.maxFeePerGas
					: minGasPrice.maxFeePerGas + 1n,
			maxPriorityFeePerGas:
				price.maxPriorityFeePerGas >= minGasPrice.maxPriorityFeePerGas
					? price.maxPriorityFeePerGas
					: minGasPrice.maxPriorityFeePerGas + 1n,
		};
	}

	// Check if a gas price meets minimum requirements (original network price)
	function meetsMinimum(price: GasPrice): boolean {
		if (!minGasPrice) return true;
		return (
			price.maxFeePerGas >= minGasPrice.maxFeePerGas &&
			price.maxPriorityFeePerGas >= minGasPrice.maxPriorityFeePerGas
		);
	}

	// Raw gas prices from network
	let rawGasPrices = $derived.by(() => {
		if (gasFeeValue.step !== 'Loaded') return null;
		return {
			slow: gasFeeValue.slow,
			average: gasFeeValue.average,
			fast: gasFeeValue.fast,
		};
	});

	// Adjusted gas prices that enforce minimum (for display and selection)
	let gasPrices = $derived.by(() => {
		if (!rawGasPrices) return null;
		return {
			slow: enforceMinimum(rawGasPrices.slow),
			average: enforceMinimum(rawGasPrices.average),
			fast: enforceMinimum(rawGasPrices.fast),
		};
	});

	// Check which preset options have been adjusted (network price was below minimum)
	let adjustedOptions = $derived.by(() => {
		if (!rawGasPrices) return {slow: false, average: false, fast: false};
		return {
			slow: !meetsMinimum(rawGasPrices.slow),
			average: !meetsMinimum(rawGasPrices.average),
			fast: !meetsMinimum(rawGasPrices.fast),
		};
	});

	// Get the best default gas price for custom field (fast or minimum if fast is too low)
	let defaultCustomGasPrice = $derived.by((): string => {
		if (gasPrices) {
			// Use fast (which is already adjusted to minimum if needed)
			return formatGwei(gasPrices.fast.maxFeePerGas);
		}
		if (minGasPrice) {
			return formatGwei(minGasPrice.maxFeePerGas);
		}
		return '';
	});

	// Initialize custom gas price when switching to custom option
	$effect(() => {
		if (
			selectedOption === 'custom' &&
			customGasPrice === '' &&
			defaultCustomGasPrice
		) {
			customGasPrice = defaultCustomGasPrice;
		}
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

	// Check if selected price is valid (meets minimum)
	let isSelectedPriceValid = $derived.by((): boolean => {
		if (!selectedGasPrice) return false;
		return meetsMinimum(selectedGasPrice);
	});

	// Validation error message for minimum gas price
	let minPriceError = $derived.by((): string | null => {
		if (!selectedGasPrice || !minGasPrice) return null;
		if (isSelectedPriceValid) return null;
		return `Gas price must be at least ${formatGwei(minGasPrice.maxFeePerGas)} gwei (previous transaction's gas price)`;
	});

	function handleSubmit() {
		if (selectedGasPrice && isSelectedPriceValid) {
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

		{#if minGasPrice}
			<div class="rounded-md border bg-muted/30 p-3 text-sm">
				<span class="text-muted-foreground">Minimum gas price:</span>
				<span class="ml-2 font-mono"
					>{formatGwei(minGasPrice.maxFeePerGas)} gwei</span
				>
				<span class="ml-1 text-xs text-muted-foreground">(previous tx)</span>
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
					{#if adjustedOptions.slow}
						<span class="text-warning mt-1 text-xs">= min</span>
					{/if}
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
					{#if adjustedOptions.average}
						<span class="text-warning mt-1 text-xs">= min</span>
					{/if}
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
					{#if adjustedOptions.fast}
						<span class="text-warning mt-1 text-xs">= min</span>
					{/if}
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
						placeholder={minGasPrice
							? `Min: ${formatGwei(minGasPrice.maxFeePerGas)}`
							: 'Enter gas price'}
						class="flex-1 rounded-md border bg-background px-3 py-2 text-sm {minPriceError
							? 'border-destructive'
							: ''}"
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

		{#if minPriceError}
			<div
				class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
			>
				{minPriceError}
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
		<Button
			onclick={handleSubmit}
			disabled={!selectedGasPrice || !isSelectedPriceValid || isSubmitting}
		>
			{#if isSubmitting}
				Submitting...
			{:else}
				Resubmit
			{/if}
		</Button>
	</Modal.Footer>
</Modal.Root>
