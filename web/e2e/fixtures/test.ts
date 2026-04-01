import {test as base, expect, type Page} from '@playwright/test';

/**
 * Extended test fixtures for E2E testing with wallet interactions.
 */

export interface WalletFixtures {
	/**
	 * Page with wallet connected via Dev Mode (burner wallet).
	 * Automatically handles the connection flow.
	 */
	connectedPage: Page;

	/**
	 * Connects the wallet using Dev Mode on the current page.
	 * Can be used when you need more control over when connection happens.
	 */
	connectWallet: (page: Page) => Promise<void>;

	/**
	 * Waits for a transaction to be confirmed.
	 */
	waitForTransaction: (page: Page) => Promise<void>;
}

/**
 * Fund a wallet address using Hardhat's JSON-RPC method
 */
async function fundWalletViaHardhat(
	page: Page,
	address: string,
	amountInEther: string = '10',
): Promise<void> {
	// Convert ether to wei in hex
	const weiAmount = BigInt(parseFloat(amountInEther) * 1e18);
	const hexAmount = '0x' + weiAmount.toString(16);

	await page.evaluate(
		async ({addr, amount}) => {
			await fetch('http://localhost:8545', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'hardhat_setBalance',
					params: [addr, amount],
					id: 1,
				}),
			});
		},
		{addr: address, amount: hexAmount},
	);
}

/**
 * Connect wallet using Dev Mode (burner wallet with test mnemonic)
 */
async function connectWalletDevMode(page: Page): Promise<void> {
	// Look for Dev Mode button in the wallet selection modal
	const devModeButton = page.getByRole('button', {name: /dev mode/i});

	// Wait for the button to be visible (modal might be opening)
	try {
		await devModeButton.waitFor({state: 'visible', timeout: 5000});
		await devModeButton.click();

		// Wait for connection to complete - the modal should close
		await page.waitForFunction(
			() => {
				const modal = document.querySelector('[role="dialog"]');
				return !modal || !modal.textContent?.includes('Sign In');
			},
			{timeout: 10000},
		);
	} catch {
		// Modal might not have appeared if already connected
		console.log('Wallet may already be connected or modal not shown');
	}

	// Handle Insufficient Funds modal - dismiss it and fund the wallet
	try {
		const dismissButton = page.getByRole('button', {name: /dismiss/i});
		const isInsufficientFundsVisible = await dismissButton
			.isVisible({timeout: 2000})
			.catch(() => false);

		if (isInsufficientFundsVisible) {
			// Get the wallet address from the page header (shows "0 ETH" with avatar)
			// Fund the wallet using Hardhat's setBalance
			const walletAddress = await page.evaluate(() => {
				// Try to get the address from localStorage where the burner wallet stores it
				const storedWallet = localStorage.getItem('__burner_wallet__');
				if (storedWallet) {
					try {
						const wallet = JSON.parse(storedWallet);
						return wallet.address || wallet.account;
					} catch {
						return null;
					}
				}
				return null;
			});

			if (walletAddress) {
				await fundWalletViaHardhat(page, walletAddress);
				// Wait for balance update to reflect
				await page.waitForTimeout(500);
			}

			// Click dismiss to close the modal
			await dismissButton.click();

			// Wait for modal to close
			await page.waitForFunction(
				() => {
					const modal = document.querySelector('[role="dialog"]');
					return !modal || !modal.textContent?.includes('Insufficient Funds');
				},
				{timeout: 5000},
			);
		}
	} catch {
		// No insufficient funds modal, that's fine
	}
}

/**
 * Wait for any pending transaction to be confirmed.
 * Waits for the send button to be enabled (not submitting) or for success toast.
 */
async function waitForTransactionComplete(page: Page): Promise<void> {
	// Wait for any pending indicators in message cards to disappear
	const pendingIndicator = page.locator('text=Pending');
	if (await pendingIndicator.isVisible({timeout: 500}).catch(() => false)) {
		await pendingIndicator.waitFor({state: 'hidden', timeout: 30000});
	}

	// Alternatively, check for success toast
	const successToast = page.locator('[data-sonner-toast][data-type="success"]');
	try {
		await successToast.waitFor({state: 'visible', timeout: 5000});
		// Give the UI a moment to update after success
		await page.waitForTimeout(500);
	} catch {
		// No success toast, that's okay - might have already dismissed
	}
}

export const test = base.extend<WalletFixtures>({
	/**
	 * Provides a page that's already connected to a wallet.
	 * Usage:
	 *   test('my test', async ({ connectedPage }) => { ... })
	 */
	connectedPage: async ({page}, use) => {
		// Navigate to demo page
		await page.goto('/demo');

		// Wait for app to initialize
		await page.waitForSelector('input[placeholder="Enter your greeting..."]', {
			timeout: 30000,
		});

		// Trigger connection by clicking send (this will open the modal)
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.fill('fixture-connection-test');
		const sendButton = page.getByRole('button', {name: /send/i});
		await sendButton.click();

		// Connect using Dev Mode
		await connectWalletDevMode(page);

		// Wait for the input to be enabled (it's disabled during submitting)
		// This also waits for the initial transaction to complete
		await expect(input).toBeEnabled({timeout: 60000});

		// Clear the input for tests
		await input.clear();

		await use(page);
	},

	/**
	 * Provides a function to connect wallet on demand.
	 */
	connectWallet: async ({}, use) => {
		await use(connectWalletDevMode);
	},

	/**
	 * Provides a function to wait for transactions.
	 */
	waitForTransaction: async ({}, use) => {
		await use(waitForTransactionComplete);
	},
});

export {expect};

// Re-export describe for convenience
export const describe = test.describe;
