import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import type {TransactionIntent} from '@etherkit/tx-observer';
import type {PopulatedMetadata} from '@etherkit/viem-tx-tracker';
import {
	createLocalStorageAdapter,
	createMultiAccountStore,
	createSyncableStore,
	defineSchema,
	map,
} from 'synqable';

export type OnchainOperationMetadata = PopulatedMetadata;

export type OnchainOperation = {
	metadata: OnchainOperationMetadata;
	transactionIntent: TransactionIntent;
};

const schema = defineSchema({
	operations: map<OnchainOperation>(),
});

export function createAccountData(params: {
	accountStore: AccountStore;
	deployments: TypedDeployments;
}) {
	const {accountStore, deployments} = params;
	return createMultiAccountStore({
		accountStore,
		factory: (account) =>
			createSyncableStore({
				schema,
				account,
				defaultData: () => {
					return {operations: {}};
				},
				storage: {
					adapterFactory: (_privateKey) => createLocalStorageAdapter(),
					key: `__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${account}`,
				},
			}),
	});
}

export type AccountDataStore = ReturnType<typeof createAccountData>;
