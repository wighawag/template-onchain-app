import type {
	AnyConnectionStore,
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
		mechanism: Partial<{type: string; name: string; address: string}>;
		wallet: Partial<{
			pendingRequests: readonly unknown[];
			accountChanged: `0x${string}`;
		}>;
	}
>;

/** A wallet as exposed by the connection store's `wallets` array. */
type WalletInfoSnapshot = {info: {name: string; icon: string}};

/**
 * How the wallet-connect entry point should present itself.
 *
 * - `none`: no injected wallets detected, show the get-a-wallet fallback.
 * - `single`: exactly one wallet, show a single button that connects to it
 *   directly (no intermediate picker).
 * - `multiple`: several wallets, show one button that opens the wallet picker.
 */
export type WalletEntryMode = 'none' | 'single' | 'multiple';

export function walletEntryMode(
	wallets: readonly WalletInfoSnapshot[],
): WalletEntryMode {
	if (wallets.length === 0) return 'none';
	if (wallets.length === 1) return 'single';
	return 'multiple';
}

/**
 * The account a sign-in should actually use.
 *
 * The library records the account chosen at connect time in
 * `mechanism.address`, but if the user swaps their active account in the wallet
 * UI while sitting on the confirm screen, the new account is surfaced as
 * `wallet.accountChanged` (the mechanism address stays stale). Signing without
 * adopting the change would sign with the OLD account. This returns the account
 * the UI should display and adopt: the swapped-to account when present,
 * otherwise the originally connected one.
 */
export function resolveSignInAddress(
	state: ConnectionStateSnapshot,
): `0x${string}` | undefined {
	return (
		state.wallet?.accountChanged ??
		(state.mechanism?.address as `0x${string}` | undefined)
	);
}

/**
 * Whether the user swapped their active wallet account while on the confirm
 * screen (so the UI can hint that the shown account changed).
 */
export function hasSwappedAccount(state: ConnectionStateSnapshot): boolean {
	return state.wallet?.accountChanged !== undefined;
}

/** Minimal connection-store surface the sign-in action needs. */
type SignInConnection = Pick<
	AnyConnectionStore<UnderlyingEthereumProvider>,
	'subscribe' | 'connectToAddress' | 'requestSignature'
>;

/**
 * Sign in from the confirm screen with a single user action.
 *
 * If the user swapped their active wallet account (so `accountChanged` is set),
 * pressing Sign In should count as confirming that account: adopt it via
 * `connectToAddress`, wait for the store to settle back on `WalletConnected`
 * with the new address (and the swap flag cleared), then request the signature,
 * without a second click. If no swap happened, request the signature directly.
 *
 * `connectToAddress` is fire-and-forget (returns void), so we observe the store
 * to know when the adopted account is ready to sign.
 */
export async function signInAdoptingSwap(
	connection: SignInConnection,
): Promise<void> {
	const state = readConnection(connection);
	const swappedTo = state.wallet?.accountChanged;

	if (!swappedTo) {
		await connection.requestSignature();
		return;
	}

	connection.connectToAddress(swappedTo);
	await waitForConnected(connection, swappedTo);
	await connection.requestSignature();
}

/** Read the current value of the connection store synchronously. */
function readConnection(connection: SignInConnection): ConnectionState {
	let current!: ConnectionState;
	connection.subscribe((v) => {
		current = v;
	})();
	return current;
}

/**
 * Resolve once the store is back on `WalletConnected` for `address` with no
 * pending swap, i.e. the adopted account is ready to be signed with. Rejects if
 * the flow leaves the wallet-connected path (e.g. cancelled) or on timeout.
 */
function waitForConnected(
	connection: SignInConnection,
	address: `0x${string}`,
	timeoutMs = 15_000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false;
		// May be reassigned by subscribe(); guarded so a synchronous first emission
		// (which can settle before subscribe() returns) doesn't touch it too early.
		let unsubscribe: (() => void) | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			unsubscribe?.();
			fn();
		};

		timer = setTimeout(
			() =>
				finish(() =>
					reject(new Error('timed out adopting the swapped account')),
				),
			timeoutMs,
		);

		unsubscribe = connection.subscribe((v) => {
			if (
				v.step === 'WalletConnected' &&
				v.wallet?.accountChanged === undefined &&
				v.mechanism?.address?.toLowerCase() === address.toLowerCase()
			) {
				finish(resolve);
			} else if (
				v.step === 'Idle' ||
				v.step === 'MechanismToChoose' ||
				v.step === 'WalletToChoose'
			) {
				finish(() => reject(new Error('sign-in cancelled')));
			}
		});

		// If the subscriber settled synchronously before assignment above, tidy up.
		if (settled) unsubscribe?.();
	});
}

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
