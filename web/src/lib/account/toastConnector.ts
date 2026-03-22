import type {
	MultiAccountDataStore,
	OnchainOperation,
	Schema,
} from './AccountData';
import {toast} from 'svelte-sonner';
import type {TransactionIntent} from '@etherkit/tx-observer';
import {subscribeToAccountDataMap} from '$lib/core/utils/data/account-data-subscription';
import {pendingOperationModal} from '$lib/core/ui/pending-operation';

/**
 * Gets a human-readable name for an operation from its metadata
 */
function getOperationName(op: OnchainOperation): string {
	const metadata = op.metadata;
	if (metadata.type === 'functionCall') {
		return metadata.functionName;
	}
	if (metadata.type === 'unknown') {
		return metadata.name;
	}
	return 'Transaction';
}

/**
 * Gets the status type for a transaction intent
 */
function getStatusType(
	intent: TransactionIntent,
): 'pending' | 'success' | 'error' {
	const state = intent.state;

	if (!state || state.inclusion === 'InMemPool') {
		return 'pending';
	}

	if (state.inclusion === 'NotFound' || state.inclusion === 'Dropped') {
		return 'error';
	}

	if (state.inclusion === 'Included') {
		if (state.status === 'Success') {
			return 'success';
		} else {
			return 'error';
		}
	}

	return 'error';
}

/**
 * Gets a descriptive message for the current status
 */
function getStatusMessage(intent: TransactionIntent): string {
	const state = intent.state;

	if (!state || state.inclusion === 'InMemPool') {
		return 'Transaction pending...';
	}

	if (state.inclusion === 'NotFound') {
		return 'Transaction not found';
	}

	if (state.inclusion === 'Dropped') {
		return 'Transaction was dropped';
	}

	if (state.inclusion === 'Included') {
		if (state.status === 'Success') {
			return 'Transaction confirmed';
		} else {
			return 'Transaction failed';
		}
	}

	return 'Unknown status';
}

/**
 * Creates a connector that shows toast notifications for operations
 * being added and updated in the account data store.
 */
export function createToastConnector(params: {
	accountData: MultiAccountDataStore;
}) {
	const {accountData} = params;

	// Map to track active toast IDs for each operation
	const operationToasts = new Map<string, string | number>();
	// Map to track last status type for each operation to prevent duplicate toasts
	const operationLastStatus = new Map<
		string,
		'pending' | 'success' | 'error'
	>();
	// Map to track last inclusion state to detect transitions within same status type (e.g. NotFound→Dropped)
	const operationLastInclusion = new Map<string, string>();
	// Map to track last final state to detect when Dropped becomes final (Inspect → Dismiss button)
	const operationLastFinal = new Map<string, boolean>();
	function deleteOperation(key: string) {
		const currentAccountData = accountData.get();
		if (currentAccountData) {
			currentAccountData.removeItem('operations', key);
		}
	}

	// Helper to open modal while keeping toast visible
	function openModalAndKeepToast(
		key: string,
		operation: OnchainOperation,
		event: MouseEvent,
	) {
		// Prevent default to stop sonner from dismissing the toast
		event.preventDefault();
		// Open the modal
		pendingOperationModal.open(key, operation);
	}

	// Show an error toast (extracted for reuse)
	// Note: Previous toast dismissal is handled by showToast before calling this
	function showErrorToast(key: string, operation: OnchainOperation) {
		const operationName = getOperationName(operation);
		const state = operation.transactionIntent.state;
		const inclusion = state?.inclusion ?? 'Unknown';
		const isFinal = !!state?.final;
		const message = getStatusMessage(operation.transactionIntent);

		// Use a unique toast ID per inclusion state and final flag to ensure proper updates
		// Include final flag so button changes from Inspect to Dismiss when Dropped becomes final
		const toastId = `${key}-${inclusion}-${isFinal ? 'final' : 'pending'}`;

		console.log('[toastConnector] showErrorToast:', {
			key,
			toastId,
			operationName,
			inclusion,
			isFinal,
			message,
		});

		// For dropped AND final transactions, directly delete without modal
		// For dropped but NOT final, show modal with Dismiss button
		// For other error states (NotFound), show Inspect to open modal with more options
		if (inclusion === 'Dropped' && isFinal) {
			toast.error(operationName, {
				description: message,
				id: toastId,
				duration: Infinity,
				action: {
					label: 'Dismiss',
					onClick: () => deleteOperation(key),
				},
			});
		} else {
			toast.error(operationName, {
				description: message,
				id: toastId,
				duration: Infinity,
				action: {
					label: 'Inspect',
					onClick: (event) => openModalAndKeepToast(key, operation, event),
				},
			});
		}
		operationToasts.set(key, toastId);
	}

	function showToast(key: string, operation: OnchainOperation) {
		const operationName = getOperationName(operation);
		const statusType = getStatusType(operation.transactionIntent);
		const message = getStatusMessage(operation.transactionIntent);
		const currentInclusion =
			operation.transactionIntent.state?.inclusion ?? '';
		const currentFinal = !!operation.transactionIntent.state?.final;

		// Skip if status AND inclusion AND final haven't changed
		// (prevents duplicate toasts but allows NotFound→Dropped transitions and Dropped non-final→final)
		const lastStatus = operationLastStatus.get(key);
		const lastInclusion = operationLastInclusion.get(key);
		const lastFinal = operationLastFinal.get(key);

		console.log('[toastConnector] showToast called:', {
			key,
			statusType,
			currentInclusion,
			currentFinal,
			lastStatus,
			lastInclusion,
			lastFinal,
			willUpdate: !(
				lastStatus === statusType &&
				lastInclusion === currentInclusion &&
				lastFinal === currentFinal
			),
		});

		if (
			lastStatus === statusType &&
			lastInclusion === currentInclusion &&
			lastFinal === currentFinal
		) {
			console.log('[toastConnector] skipping - no change');
			return;
		}

		operationLastStatus.set(key, statusType);
		operationLastInclusion.set(key, currentInclusion);
		operationLastFinal.set(key, currentFinal);

		// Create unique toast ID based on current state
		// For error states, include inclusion and final flag to ensure proper updates
		const toastId =
			statusType === 'error'
				? `${key}-${currentInclusion}-${currentFinal ? 'final' : 'pending'}`
				: `${key}-${statusType}`;

		// Dismiss previous toast if ID changed
		const previousToastId = operationToasts.get(key);
		if (previousToastId && previousToastId !== toastId) {
			toast.dismiss(previousToastId);
		}

		if (statusType === 'pending') {
			toast.loading(operationName, {
				description: message,
				id: toastId,
			});
			operationToasts.set(key, toastId);
		} else if (statusType === 'success') {
			toast.success(operationName, {
				description: message,
				id: toastId,
			});
			operationToasts.set(key, toastId);
		} else if (statusType === 'error') {
			// Use shared error toast function which handles its own toast ID
			showErrorToast(key, operation);
		} else {
			toast.warning(operationName, {
				description: message,
				id: toastId,
			});
			operationToasts.set(key, toastId);
		}
	}

	function handleOperationRemoved(key: string) {
		const toastId = operationToasts.get(key);
		if (toastId) {
			toast.dismiss(toastId);
			operationToasts.delete(key);
		}
		operationLastStatus.delete(key);
		operationLastInclusion.delete(key);
		operationLastFinal.delete(key);
	}

	function clearAllToasts() {
		for (const toastId of operationToasts.values()) {
			toast.dismiss(toastId);
		}
		operationToasts.clear();
		operationLastStatus.clear();
		operationLastInclusion.clear();
		operationLastFinal.clear();
	}

	let stopConnection: (() => void) | undefined;

	function connect() {
		// Clean up any existing connection
		stopConnection?.();
		stopConnection = undefined;

		const unsubscribe = subscribeToAccountDataMap<Schema, 'operations'>({
			accountData,
			mapKey: 'operations',
			handlers: {
				onAdded: (key, item) => {
					showToast(key, item);
				},
				onUpdated: (key, item) => {
					showToast(key, item);
				},
				onRemoved: (key) => {
					handleOperationRemoved(key);
				},
				onClear: () => {
					clearAllToasts();
				},
				onInitialData: (operations) => {
					for (const [key, operation] of Object.entries(operations)) {
						const statusType = getStatusType(operation.transactionIntent);
						// Only show toasts for pending operations on initial load
						if (statusType !== 'success' && !operationToasts.has(key)) {
							showToast(key, operation);
						}
					}
				},
			},
		});

		return () => {
			unsubscribe();
			clearAllToasts();
		};
	}

	return {
		connect: () => {
			stopConnection = connect();
		},
		disconnect: () => {
			stopConnection?.();
			stopConnection = undefined;
		},
	};
}
