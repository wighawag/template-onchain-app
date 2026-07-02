import {get} from 'svelte/store';
import {
	InsufficientFundsError,
	isUserRejectionError,
} from '$lib/core/transaction';
import type {Context} from '$lib/context/types';

export type SetGreetingResult =
	| {status: 'submitted'}
	| {status: 'cancelled'}
	| {status: 'error'; message: string};

export type SetGreetingDeps = Pick<
	Context,
	'connection' | 'walletClient' | 'deployments' | 'balanceCheck'
>;

/**
 * Submit a `setMessage` transaction to the GreetingsRegistry.
 *
 * Owns the whole onchain flow (ensure connected, balance check, write) and
 * normalises outcomes so the component only has to render:
 * - `submitted`: the tx was sent.
 * - `cancelled`: the user dismissed the funds modal or rejected in-wallet
 *   (no error should be shown).
 * - `error`: a real failure, with a user-facing message.
 */
export async function setGreeting(
	deps: SetGreetingDeps,
	message: string,
): Promise<SetGreetingResult> {
	const {connection, walletClient, deployments, balanceCheck} = deps;

	const trimmed = message.trim();
	if (!trimmed) return {status: 'cancelled'};

	try {
		const currentConnection = await connection.ensureConnected();
		const $deployments = get(deployments);

		const contractRequest = await balanceCheck.ensureCanAfford({
			contract: {
				address: $deployments.contracts.GreetingsRegistry.address,
				abi: $deployments.contracts.GreetingsRegistry.abi,
				functionName: 'setMessage',
				args: [trimmed],
				account: currentConnection.account.address,
			},
		});

		await walletClient.writeContract(contractRequest);
		return {status: 'submitted'};
	} catch (error) {
		if (error instanceof InsufficientFundsError || isUserRejectionError(error)) {
			// User dismissed the funds modal or rejected in their wallet.
			return {status: 'cancelled'};
		}
		console.error('Failed to set greeting:', error);
		return {
			status: 'error',
			message: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}
