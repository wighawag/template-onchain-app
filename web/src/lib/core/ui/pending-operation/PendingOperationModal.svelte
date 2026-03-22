<script lang="ts">
	import {getUserContext} from '$lib';
	import * as Modal from '$lib/core/ui/modal/index.js';
	import {Button} from '$lib/shadcn/ui/button/index.js';
	import {Badge} from '$lib/shadcn/ui/badge/index.js';
	import {pendingOperationModal} from './pending-operation-store';
	import OperationDetailsView from './OperationDetailsView.svelte';
	import TransactionAttemptsList from './TransactionAttemptsList.svelte';
	import GasPricingForm from './GasPricingForm.svelte';
	import ConfirmDismissDialog from './ConfirmDismissDialog.svelte';
	import ConfirmCancelDialog from './ConfirmCancelDialog.svelte';
	import type {GasPrice} from '$lib/core/connection/gasFee';
	import type {ExtendedTransactionMetadata} from '$lib/account/AccountData';
	import deployments from '$lib/deployments';

	const {walletClient, accountData, gasFee} = getUserContext();

	// Modal state
	let showDismissConfirm = $state(false);
	let showResubmitForm = $state(false);
	let showCancelConfirm = $state(false);
	let isSubmitting = $state(false);

	// Separate error messages for each dialog
	let resubmitError = $state<string | null>(null);
	let cancelError = $state<string | null>(null);

	// Derived from store
	let modalState = $derived($pendingOperationModal);
	let isOpen = $derived(modalState.open);
	let operation = $derived(modalState.operation);
	let operationKey = $derived(modalState.operationKey);

	// Get status string from transaction intent state
	let status = $derived(
		operation?.transactionIntent.state?.inclusion || 'Fetching',
	);

	// Get current gas price from operation's tracked transaction metadata
	let currentGasPrice = $derived.by(() => {
		if (!operation) return undefined;
		const tx = operation.metadata.tx;
		// gasParameters is nested in the tracked transaction
		const gasParams = tx.gasParameters as {
			maxFeePerGas?: bigint;
			gasPrice?: bigint;
		};
		return gasParams?.maxFeePerGas ?? gasParams?.gasPrice;
	});

	function handleClose() {
		pendingOperationModal.close();
		resetState();
	}

	function resetState() {
		showDismissConfirm = false;
		showResubmitForm = false;
		showCancelConfirm = false;
		resubmitError = null;
		cancelError = null;
	}

	function closeResubmitForm() {
		showResubmitForm = false;
		resubmitError = null;
	}

	function closeCancelConfirm() {
		showCancelConfirm = false;
		cancelError = null;
	}

	async function handleDismiss() {
		if (operationKey) {
			const currentAccountData = accountData.get();
			currentAccountData?.removeItem('operations', operationKey);
			handleClose();
		}
	}

	async function handleResubmit(gasPrice: GasPrice) {
		if (!operation || !operationKey) return;

		try {
			isSubmitting = true;
			resubmitError = null;

			const originalTx = operation.metadata.tx;
			// Create metadata with operationId to link this resubmit to the existing operation
			const resubmitMetadata: ExtendedTransactionMetadata = {
				type: 'unknown',
				name: 'Resubmit Transaction',
				data: [],
				operationId: operationKey,
			};
			await walletClient.sendTransaction({
				account: originalTx.from,
				chain: deployments.chain, // TODO? tx.chain ?
				to: originalTx.to as `0x${string}`,
				data: originalTx.data,
				value: originalTx.value,
				nonce: originalTx.nonce,
				maxFeePerGas: gasPrice.maxFeePerGas,
				maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
				metadata: resubmitMetadata,
			});

			handleClose();
		} catch (err: unknown) {
			const error = err as {code?: number; message?: string};
			if (error.code === 4001) {
				resubmitError = 'Transaction rejected by user';
			} else if (error.message?.includes('nonce')) {
				resubmitError =
					'Nonce conflict - transaction may have already been processed';
			} else {
				resubmitError = error.message || 'Failed to resubmit transaction';
			}
			console.error(resubmitError);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleCancel() {
		if (!operation) return;

		try {
			isSubmitting = true;
			cancelError = null;

			// Get the original gas price from the stored transaction
			const originalTx = operation.metadata.tx;
			const gasParams = originalTx.gasParameters as {
				maxFeePerGas?: bigint;
				gasPrice?: bigint;
			};
			const originalGasPrice =
				gasParams?.maxFeePerGas ?? gasParams?.gasPrice ?? 0n;

			const gasFeeValue = $gasFee;
			const fastPrice =
				gasFeeValue.step === 'Loaded' ? gasFeeValue.fast.maxFeePerGas : 0n;

			// Use higher of fast price or original + 1
			const cancelGasPrice =
				originalGasPrice >= fastPrice ? originalGasPrice + 1n : fastPrice;

			await walletClient.sendTransaction({
				account: originalTx.from,
				chain: deployments.chain,
				to: originalTx.from,
				value: 0n,
				nonce: originalTx.nonce,
				maxFeePerGas: cancelGasPrice,
				maxPriorityFeePerGas: cancelGasPrice,
				metadata: {
					type: 'unknown',
					name: 'Cancel Transaction',
					data: [],
				},
			});

			handleClose();
		} catch (err: unknown) {
			const error = err as {code?: number; message?: string};
			if (error.code === 4001) {
				cancelError = 'Transaction rejected by user';
			} else if (error.message?.includes('nonce')) {
				cancelError =
					'Nonce conflict - transaction may have already been processed';
			} else {
				cancelError = error.message || 'Failed to cancel transaction';
			}
		} finally {
			isSubmitting = false;
		}
	}
</script>

<Modal.Root openWhen={isOpen} onCancel={handleClose}>
	{#if operation}
		<Modal.Title>
			<span class="flex items-center gap-2">
				Pending Transaction
				<Badge variant="destructive">{status}</Badge>
			</span>
		</Modal.Title>

		<div class="space-y-4 py-4">
			<OperationDetailsView {operation} />

			<TransactionAttemptsList
				transactions={operation.transactionIntent.transactions}
			/>
		</div>

		<Modal.Footer>
			<Button variant="outline" onclick={() => (showDismissConfirm = true)}>
				Dismiss
			</Button>
			{#if status !== 'Dropped'}
				<Button variant="secondary" onclick={() => (showResubmitForm = true)}>
					Resubmit
				</Button>
				<Button variant="destructive" onclick={() => (showCancelConfirm = true)}>
					Cancel Transaction
				</Button>
			{/if}
		</Modal.Footer>
	{/if}
</Modal.Root>

<!-- Sub-dialogs -->
<ConfirmDismissDialog
	open={showDismissConfirm}
	onConfirm={handleDismiss}
	onCancel={() => (showDismissConfirm = false)}
	{status}
/>

<GasPricingForm
	open={showResubmitForm}
	onSubmit={handleResubmit}
	onCancel={closeResubmitForm}
	{isSubmitting}
	{currentGasPrice}
	errorMessage={resubmitError}
/>

<ConfirmCancelDialog
	open={showCancelConfirm}
	onConfirm={handleCancel}
	onCancel={closeCancelConfirm}
	{isSubmitting}
	errorMessage={cancelError}
/>
