import type {
	MultiAccountDataStore,
	OnchainOperation,
	Schema,
} from './AccountData';
import {toast} from 'svelte-sonner';
import type {TransactionIntent} from '@etherkit/tx-observer';
import {subscribeToAccountDataMap} from '$lib/core/utils/data/account-data-subscription';

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

	function deleteOperation(key: string) {
		const currentAccountData = accountData.get();
		if (currentAccountData) {
			currentAccountData.removeItem('operations', key);
		}
	}

	function showToast(key: string, operation: OnchainOperation) {
		const operationName = getOperationName(operation);
		const statusType = getStatusType(operation.transactionIntent);
		const message = getStatusMessage(operation.transactionIntent);

		// Skip if status hasn't changed (prevents duplicate toasts from multiple update events)
		const lastStatus = operationLastStatus.get(key);
		if (lastStatus === statusType) {
			return;
		}
		operationLastStatus.set(key, statusType);

		if (statusType === 'pending') {
			toast.loading(operationName, {
				description: message,
				id: key,
			});
		} else if (statusType === 'success') {
			toast.success(operationName, {
				description: message,
				id: key,
			});
		} else if (statusType === 'error') {
			toast.error(operationName, {
				description: message,
				id: key,
				duration: Infinity,
				action: {
					label: 'Dismiss',
					onClick: () => deleteOperation(key),
				},
			});
		} else {
			toast.warning(operationName, {
				description: message,
				id: key,
			});
		}

		operationToasts.set(key, key);
	}

	function handleOperationRemoved(key: string) {
		const toastId = operationToasts.get(key);
		if (toastId) {
			toast.dismiss(toastId);
			operationToasts.delete(key);
		}
		operationLastStatus.delete(key);
	}

	function clearAllToasts() {
		for (const toastId of operationToasts.values()) {
			toast.dismiss(toastId);
		}
		operationToasts.clear();
		operationLastStatus.clear();
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
