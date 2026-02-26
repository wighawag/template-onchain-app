import type {Dependencies} from './types.js';

import {establishRemoteConnection} from './core/connection';
import {createBalanceStore} from './core/connection/balance';
import {createGasFeeStore} from './core/connection/gasFee';

export async function createDependencies(): Promise<Dependencies> {
	const window = globalThis as any;

	// ----------------------------------------------------------------------------
	// CONNECTION
	// ----------------------------------------------------------------------------

	const {
		signer,
		connection,
		walletClient,
		publicClient,
		paymentConnection,
		paymentWalletClient,
		paymentPublicClient,
		account,
		deployments,
	} = await establishRemoteConnection();

	window.paymentConnection = paymentConnection;
	window.paymentWalletClient = paymentWalletClient;
	window.paymentPublicClient = paymentPublicClient;
	window.connection = connection;
	window.walletClient = walletClient;
	window.publicClient = publicClient;
	window.deployments = deployments;

	// ----------------------------------------------------------------------------

	// ----------------------------------------------------------------------------
	// BALANCE AND COSTS
	// ----------------------------------------------------------------------------

	const balance = createBalanceStore({publicClient, signer});
	// to keep balance in memory
	// TODO use an methodology to handle this when wanted
	balance.subscribe((v) => {});
	window.balance = balance;

	// ----------------------------------------------------------------------------

	// TODO use deployment store ?
	const gasFee = createGasFeeStore({
		publicClient: publicClient as any, // TODO fix publicClient type
		deployments: deployments.current,
	});
	window.gasFee = gasFee;

	// TODO remove
	// we trigger it
	gasFee.subscribe((v) => {
		console.log(`gas fee updated`, v);
	});
	window.gasFee = gasFee;
	// ----------------------------------------------------------------------------

	return {
		gasFee,
		balance,
		paymentConnection,
		paymentWalletClient,
		paymentPublicClient,
		connection,
		walletClient,
		publicClient,
		account,
		deployments,
	};
}
