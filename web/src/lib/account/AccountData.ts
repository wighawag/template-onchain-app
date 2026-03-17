import type {Clock} from '$lib/context/types';
import type {AccountStore, TypedDeployments} from '$lib/core/connection/types';
import {serializer} from '$lib/core/utils/data/serializer';
import type {TransactionIntent} from '@etherkit/tx-observer';
import type {
	PopulatedMetadata,
	TrackedTransaction,
} from '@etherkit/viem-tx-tracker';
import {
	createLocalStorageAdapter,
	createMultiAccountStore,
	createSyncableStore,
	defineSchema,
	map,
} from 'synqable';

export type TransactionMetadata = PopulatedMetadata;

export type OnchainOperationMetadata = TransactionMetadata & {
	tx: Omit<TrackedTransaction<PopulatedMetadata>, 'metadata'>;
};

export type OnchainOperation = {
	metadata: OnchainOperationMetadata;
	transactionIntent: TransactionIntent;
};

const schema = defineSchema({
	operations: map<OnchainOperation>(),
});

export type Schema = typeof schema;

export function createAccountData(params: {
	accountStore: AccountStore;
	deployments: TypedDeployments;
	clock: Clock;
}) {
	const {accountStore, deployments, clock} = params;
	return createMultiAccountStore({
		accountStore,
		schema,
		factory: (account) =>
			createSyncableStore({
				schema,
				account,
				defaultData: () => {
					return {operations: {}};
				},
				clock: () => clock.now(),
				storage: {
					adapterFactory: (_privateKey) =>
						createLocalStorageAdapter(serializer),
					key: `__private__${deployments.chain.id}_${deployments.chain.genesisHash}_${deployments.contracts.GreetingsRegistry.address}_${account}`,
				},
			}),
	});
}

export type MultiAccountDataStore = ReturnType<typeof createAccountData>;
