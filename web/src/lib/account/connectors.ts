import type {TrackedWalletClientType} from '@etherkit/viem-tx-tracker';
import type {
	ExtendedTransactionMetadata,
	MultiAccountDataStore,
	TransactionMetadata,
} from './AccountData';
import type {TransactionObserver} from '@etherkit/tx-observer';
import {hookTxObserverToAccountData} from '$lib/core/utils/data/synqable-transactions';

/// Listen for broadcasted transaction and save them in the Account Data
export function createTrackedWalletConnector(params: {
	walletClient: TrackedWalletClientType<TransactionMetadata, true>;
	accountData: MultiAccountDataStore;
}) {
	const {accountData, walletClient} = params;

	let unsubscribeFromBroadcastedTransaction: (() => void) | undefined;
	let unsubscribeFromFetchedTransaction: (() => void) | undefined;
	function connect() {
		disconnect();
		unsubscribeFromBroadcastedTransaction = walletClient.on(
			'transaction:broadcasted',
			(tx) => {
				// Check if this is a resubmit (has operationId in metadata)
				const metadata = tx.metadata as ExtendedTransactionMetadata;
				if (metadata.operationId) {
					console.log(`adding to ${metadata.operationId}`);
					// Add transaction to existing operation
					accountData.addTransactionToOperation(metadata.operationId, tx);
				} else {
					console.log(`new operation`);
					// Create new operation
					accountData.addOperationFromTrackedTransaction(tx);
				}
			},
		);
		// if needed we can also update on getting the full tx data
		unsubscribeFromFetchedTransaction = walletClient.on(
			'transaction:fetched',
			(tx) => {
				console.log(
					`transaction:fetche`,
					JSON.stringify(tx, (k, v) =>
						typeof v === 'bigint' ? v.toString() : v,
					),
				);
				accountData.updateOperationFromFetchedTransaction(tx);
			},
		);
	}

	function disconnect() {
		unsubscribeFromBroadcastedTransaction?.();
		unsubscribeFromFetchedTransaction?.();
	}

	return {
		connect,
		disconnect,
	};
}

/// Listen for Account Data transaction being added/removed
///  Notify the transaction observer
///  And in turn save any update from the observer
export function createTransactionObserverConnector(params: {
	txObserver: TransactionObserver;
	accountData: MultiAccountDataStore;
}) {
	const {accountData, txObserver} = params;

	function notifyObserverOfTransactions() {
		return hookTxObserverToAccountData({
			accountData,
			mapKey: 'operations',
			extractValue: (item) => item.transactionIntent,
			observer: txObserver,
		});
	}

	let stopListeningForTransactions: (() => void) | undefined;
	let unsubscribeFromTransactionUpdates: (() => void) | undefined;
	function connect() {
		disconnect();
		unsubscribeFromTransactionUpdates = txObserver.on(
			'intent:status',
			(event) => accountData.updateOperationFromTransactionStateUpdated(event),
		);
		stopListeningForTransactions = notifyObserverOfTransactions();
	}

	function disconnect() {
		stopListeningForTransactions?.();
		unsubscribeFromTransactionUpdates?.();
	}

	return {
		connect,
		disconnect,
	};
}
