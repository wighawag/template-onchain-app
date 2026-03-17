import {derived, type Readable} from 'svelte/store';
import type {Message, OnchainStateStore} from '$lib/onchain/state';
import type {Schema} from '$lib/account/AccountData';
import type {FieldReadable} from 'synqable';
import {zeroAddress} from 'viem';

export type MessageView = Message & {pending?: boolean};

export type ViewState = MessageView[];

export type ViewStateStore = Readable<ViewState>;

export function createViewState(params: {
	onchainState: OnchainStateStore;
	operations: FieldReadable<Schema, 'operations'>;
}) {
	const {onchainState, operations} = params;
	const viewState = derived(
		[onchainState, operations],
		([$onchainState, $operations]): ViewState => {
			const messageViews: ViewState = [];
			for (const message of $onchainState) {
				messageViews.push(message);
			}
			// TODO use $accountData (but so far we only react to account change)

			const operationIds = Object.keys($operations);
			for (const operationID of operationIds) {
				const operation = $operations[operationID];
				if (
					operation.metadata.type === 'functionCall' &&
					operation.metadata.functionName === 'setMessage'
				) {
					// const account  =
					messageViews.push({
						account: zeroAddress,
						message: (operation.metadata.args?.[0] as string) || '',
						timestamp: Math.floor(
							operation.transactionIntent.transactions[0].broadcastTimestampMs /
								1000,
						),
						pending: true,
					});
				}
			}

			return messageViews;
		},
	);

	return viewState;
}
