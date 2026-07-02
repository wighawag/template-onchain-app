import type {
	Connection,
	UnderlyingEthereumProvider,
} from '@etherplay/connect';

/**
 * Connection-flow view helpers.
 *
 * These interpret the connection store's state for the flow UI. They are pure
 * (operate on the state snapshot) so the presentation logic is testable and out
 * of the .svelte file.
 */

/** The value emitted by the app's connection store (`$connection`). */
type ConnectionState = Connection<UnderlyingEthereumProvider>;

/**
 * Structural subset of {@link ConnectionState} these helpers actually read.
 *
 * Deriving each field from the real union (rather than re-declaring loose
 * shapes) means a rename of `step`, `mechanism.type`/`.name`, or
 * `wallet.pendingRequests` upstream fails the typecheck here, while still
 * letting tests pass lightweight fixtures. The fields are `Partial` because
 * `mechanism`/`wallet` only exist on some steps of the union.
 */
type ConnectionStateSnapshot = Partial<
	Pick<ConnectionState, 'step'> & {
		mechanism: Partial<{type: string; name: string}>;
		wallet: Partial<{pendingRequests: readonly unknown[]}>;
	}
>;

/**
 * A burner wallet is still in its selection phase (not yet actively connecting).
 *
 * TODO: replace this burner-wallet-specific detection with a generic signal,
 * e.g. an `auto` mode or a provider field like `requiresNoUserConfirmation`.
 */
export function isBurnerWalletInSelectionPhase(
	state: ConnectionStateSnapshot,
): boolean {
	return (
		state.step !== 'Idle' &&
		state.step !== 'MechanismToChoose' &&
		state.mechanism?.type === 'wallet' &&
		state.mechanism?.name === 'Burner Wallet'
	);
}

/**
 * Whether to show the "confirm the request in your wallet" prompt: there is a
 * pending wallet request and we're not in the burner-wallet selection phase.
 */
export function hasPendingWalletRequest(
	state: ConnectionStateSnapshot,
): boolean {
	return (
		(state.wallet?.pendingRequests?.length ?? 0) > 0 &&
		!isBurnerWalletInSelectionPhase(state)
	);
}
