import {describe, it, expect} from 'vitest';
import {
	isBurnerWalletInSelectionPhase,
	hasPendingWalletRequest,
} from '../../../../src/lib/core/connection/connection-flow';

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
