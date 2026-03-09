import {derived, type Readable} from 'svelte/store';
import type {Message, OnchainStateStore} from '$lib/onchain/state';
import type {AccountDataStore} from '$lib/account/AccountData';

export type MessageView = Message & {pending?: boolean};

export type ViewState = MessageView[];

export type ViewStateStore = Readable<ViewState>;

export function createViewState(params: {
	onchainState: OnchainStateStore;
	accountData: AccountDataStore;
}) {
	const {onchainState, accountData} = params;
	const viewState = derived(
		[onchainState, accountData],
		([$onchainState, $accountData]): ViewState => {
			const messageViews = [];
			for (const message of $onchainState) {
				messageViews.push(message);
			}

			return messageViews;
		},
	);

	return viewState;
}
