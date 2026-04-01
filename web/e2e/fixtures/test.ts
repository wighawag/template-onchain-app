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

	// Handle Insufficient Funds modal - click "Get ETH" to use the faucet API
	try {
		const getEthButton = page.getByRole('button', {name: /get eth/i});
		const isInsufficientFundsVisible = await getEthButton
			.isVisible({timeout: 3000})
			.catch(() => false);

		if (isInsufficientFundsVisible) {
			// Click "Get ETH" - this will call the faucet API directly (no popup)
			await getEthButton.click();

			// Wait for "Continue Transaction" button to appear (indicates funds are sufficient)
			const continueButton = page.getByRole('button', {name: /continue transaction/i});
			await continueButton.waitFor({state: 'visible', timeout: 30000});
			
			// Click "Continue Transaction" to proceed with the original transaction
			await continueButton.click();

			// Wait for modal to close
			await page.waitForFunction(
				() => {
					const modal = document.querySelector('[role="dialog"]');
					return !modal || !modal.textContent?.includes('Funds');
				},
				{timeout: 10000},
			);
		}
	} catch {
		// No insufficient funds modal, that's fine
	}
}

/**
 * Wait for any pending transaction to be confirmed.
 * Waits for all pending indicators to disappear.
 */
async function waitForTransactionComplete(page: Page): Promise<void> {
	// Wait for ALL pending indicators in message cards to disappear
	// Use a function that checks if any pending text exists
	try {
		await page.waitForFunction(
			() => {
				const pendingElements = document.querySelectorAll(
					'[class*="animate-spin"], [class*="Pending"]',
				);
				// Also check for "Transaction pending" text
				const pendingText = document.body.textContent?.includes(
					'Transaction pending',
				);
				return pendingElements.length === 0 && !pendingText;
			},
			{timeout: 30000},
		);
	} catch {
		// Timeout - might still have pending indicators, but continue
	}

	// Give the UI a moment to settle
	await page.waitForTimeout(500);
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
