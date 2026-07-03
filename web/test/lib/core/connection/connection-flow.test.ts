import {describe, it, expect} from 'vitest';
import {
	isBurnerWalletInSelectionPhase,
	hasPendingWalletRequest,
	walletEntryMode,
	resolveSignInAddress,
	hasSwappedAccount,
	signInAdoptingSwap,
} from '../../../../src/lib/core/connection/connection-flow';

const wallet = (name: string) => ({info: {name, icon: ''}});
const addr = (n: number) =>
	`0x${n.toString(16).padStart(40, '0')}` as `0x${string}`;

describe('isBurnerWalletInSelectionPhase', () => {
	it('is true for an active burner wallet mechanism', () => {
		expect(
			isBurnerWalletInSelectionPhase({
				step: 'WalletConnected',
				mechanism: {type: 'wallet', name: 'Burner Wallet'},
			}),
		).toBe(true);
	});

	it('is false in Idle / MechanismToChoose or non-burner wallets', () => {
		expect(
			isBurnerWalletInSelectionPhase({
				step: 'Idle',
				mechanism: {type: 'wallet', name: 'Burner Wallet'},
			}),
		).toBe(false);
		expect(
			isBurnerWalletInSelectionPhase({
				step: 'MechanismToChoose',
				mechanism: {type: 'wallet', name: 'Burner Wallet'},
			}),
		).toBe(false);
		expect(
			isBurnerWalletInSelectionPhase({
				step: 'WalletConnected',
				mechanism: {type: 'wallet', name: 'MetaMask'},
			}),
		).toBe(false);
	});
});

describe('hasPendingWalletRequest', () => {
	it('is true when there are pending requests and not in burner selection', () => {
		expect(
			hasPendingWalletRequest({
				step: 'WalletConnected',
				mechanism: {type: 'wallet', name: 'MetaMask'},
				wallet: {pendingRequests: [{}]},
			}),
		).toBe(true);
	});

	it('is false when there are no pending requests', () => {
		expect(
			hasPendingWalletRequest({
				step: 'WalletConnected',
				wallet: {pendingRequests: []},
			}),
		).toBe(false);
	});

	it('is suppressed during the burner selection phase', () => {
		expect(
			hasPendingWalletRequest({
				step: 'WalletConnected',
				mechanism: {type: 'wallet', name: 'Burner Wallet'},
				wallet: {pendingRequests: [{}]},
			}),
		).toBe(false);
	});
});

describe('walletEntryMode', () => {
	it('is none with no wallets', () => {
		expect(walletEntryMode([])).toBe('none');
	});
	it('is single with exactly one wallet', () => {
		expect(walletEntryMode([wallet('MetaMask')])).toBe('single');
	});
	it('is multiple with more than one wallet', () => {
		expect(walletEntryMode([wallet('MetaMask'), wallet('Rabby')])).toBe(
			'multiple',
		);
	});
});

describe('resolveSignInAddress', () => {
	it('uses the connected account when no swap happened', () => {
		expect(
			resolveSignInAddress({
				step: 'WalletConnected',
				mechanism: {type: 'wallet', name: 'MetaMask', address: addr(1)},
				wallet: {},
			}),
		).toBe(addr(1));
	});

	it('prefers the swapped-to account over the stale mechanism address', () => {
		expect(
			resolveSignInAddress({
				step: 'WalletConnected',
				mechanism: {type: 'wallet', name: 'MetaMask', address: addr(1)},
				wallet: {accountChanged: addr(2)},
			}),
		).toBe(addr(2));
	});

	it('is undefined when neither is available', () => {
		expect(resolveSignInAddress({step: 'WalletToChoose'})).toBeUndefined();
	});
});

describe('hasSwappedAccount', () => {
	it('is true when accountChanged is set', () => {
		expect(
			hasSwappedAccount({
				step: 'WalletConnected',
				wallet: {accountChanged: addr(2)},
			}),
		).toBe(true);
	});
	it('is false when accountChanged is absent', () => {
		expect(hasSwappedAccount({step: 'WalletConnected', wallet: {}})).toBe(
			false,
		);
	});
});

describe('signInAdoptingSwap', () => {
	// A tiny writable-store stand-in exposing only the surface the action uses.
	function makeStore(initial: any) {
		let value = initial;
		const subs = new Set<(v: any) => void>();
		const set = (v: any) => {
			value = v;
			for (const s of subs) s(value);
		};
		return {
			set,
			get: () => value,
			subscribe(run: (v: any) => void) {
				subs.add(run);
				run(value);
				return () => subs.delete(run);
			},
		};
	}

	it('signs directly when there was no swap', async () => {
		const store = makeStore({
			step: 'WalletConnected',
			mechanism: {type: 'wallet', name: 'MetaMask', address: addr(1)},
			wallet: {},
		});
		const calls: string[] = [];
		const connection = {
			subscribe: store.subscribe,
			connectToAddress: () => calls.push('connectToAddress'),
			requestSignature: async () => {
				calls.push('requestSignature');
			},
		};

		await signInAdoptingSwap(connection as never);

		expect(calls).toEqual(['requestSignature']);
	});

	it('adopts the swapped account then signs in one action', async () => {
		const store = makeStore({
			step: 'WalletConnected',
			mechanism: {type: 'wallet', name: 'MetaMask', address: addr(1)},
			wallet: {accountChanged: addr(2)},
		});
		const calls: string[] = [];
		const connection = {
			subscribe: store.subscribe,
			connectToAddress: (address: `0x${string}`) => {
				calls.push('connectToAddress');
				// Simulate the store settling on the adopted account.
				store.set({
					step: 'WalletConnected',
					mechanism: {type: 'wallet', name: 'MetaMask', address},
					wallet: {},
				});
			},
			requestSignature: async () => {
				calls.push('requestSignature');
			},
		};

		await signInAdoptingSwap(connection as never);

		expect(calls).toEqual(['connectToAddress', 'requestSignature']);
		expect(store.get().mechanism.address).toBe(addr(2));
	});

	it('rejects if the flow is cancelled while adopting', async () => {
		const store = makeStore({
			step: 'WalletConnected',
			mechanism: {type: 'wallet', name: 'MetaMask', address: addr(1)},
			wallet: {accountChanged: addr(2)},
		});
		const connection = {
			subscribe: store.subscribe,
			connectToAddress: () => {
				store.set({step: 'Idle'});
			},
			requestSignature: async () => {},
		};

		await expect(signInAdoptingSwap(connection as never)).rejects.toThrow(
			/cancelled/,
		);
	});
});
