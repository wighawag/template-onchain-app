import {derived, type Readable} from 'svelte/store';
import type {Message, OnchainStateStore} from '$lib/onchain/state';
import type {Schema} from '$lib/account/AccountData';
import type {FieldReadable} from 'synqable';

export type MessageView = Message & {pending?: boolean};

export type ViewState = MessageView[];

export type ViewStateStore = Readable<ViewState>;

export function createViewState(params: {
	onchainState: OnchainStateStore;
	operations: FieldReadable<Schema, 'operations'>;
	config: {
		maxMessages: number;
	};
}) {
	const {onchainState, operations, config} = params;
	const viewState = derived(
		[onchainState, operations],
		([$onchainState, $operations]): ViewState => {
			const messageViews: ViewState = [];
			for (const message of $onchainState) {
				messageViews.push({...message});
			}

			const inclusionsToIgnore = ['NotFound', 'Dropped'];

			// First, filter to get only valid setMessage operations
			const validOperations: Array<{
				operationID: string;
				operation: (typeof $operations)[string];
			}> = [];
			for (const operationID of Object.keys($operations)) {
				const operation = $operations[operationID];
				if (
					operation.transactionIntent.state?.status !== 'Failure' &&
					!inclusionsToIgnore.find(
						(v) => operation.transactionIntent.state?.inclusion == v,
					) &&
					operation.metadata.type === 'functionCall' &&
					operation.metadata.functionName === 'setMessage'
				) {
					validOperations.push({operationID, operation});
				}
			}

			// Group operations by account and find the latest for each account
			// Latest is determined by: highest nonce, or latest broadcastTimestamp if nonces are equal
			const latestOperationByAccount = new Map<
				string,
				(typeof validOperations)[number]
			>();
			for (const entry of validOperations) {
				const account = entry.operation.metadata.tx.from.toLowerCase();
				const existing = latestOperationByAccount.get(account);
				if (!existing) {
					latestOperationByAccount.set(account, entry);
				} else {
					const existingNonce = existing.operation.metadata.tx.nonce;
					const currentNonce = entry.operation.metadata.tx.nonce;
					const existingTimestamp =
						existing.operation.metadata.tx.broadcastTimestampMs;
					const currentTimestamp =
						entry.operation.metadata.tx.broadcastTimestampMs;

					// Compare by nonce first, then by broadcastTimestamp if nonces are equal
					if (
						currentNonce > existingNonce ||
						(currentNonce === existingNonce &&
							currentTimestamp > existingTimestamp)
					) {
						latestOperationByAccount.set(account, entry);
					}
				}
			}

			// Apply the latest operation for each account to the view
			for (const entry of latestOperationByAccount.values()) {
				const operation = entry.operation;
				const account = operation.metadata.tx.from;
				const time = operation.metadata.tx.broadcastTimestampMs;
				const metadata = operation.metadata as {args?: unknown[]};
				const message = (metadata.args?.[0] as string) || '';

				const existingMessageIndex = messageViews.findIndex(
					(v) => v.account.toLowerCase() === account.toLowerCase(),
				);

				if (existingMessageIndex >= 0) {
					const existingMessageObject = messageViews[existingMessageIndex];
					// If onchain message matches and onchain timestamp is newer, operation is complete
					if (
						existingMessageObject.message === message &&
						existingMessageObject.timestamp > time
					) {
						// Onchain state already reflects this operation, no pending needed
						continue;
					}
					// Otherwise, replace with pending operation
					messageViews.splice(existingMessageIndex, 1);
				}

				messageViews.unshift({
					account,
					message,
					timestamp: time,
					pending: operation.transactionIntent.state?.inclusion !== 'Included',
				});
			}

			messageViews.splice(config.maxMessages);

			return messageViews;
		},
	);

	return viewState;
}
