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
}

/**
 * Wait for any pending transaction to be confirmed.
 * Looks for loading indicators and waits for them to disappear.
 */
async function waitForTransactionComplete(page: Page): Promise<void> {
	// Wait for any spinners to disappear
	const spinner = page.locator('[class*="animate-spin"]');
	if (await spinner.isVisible({timeout: 1000}).catch(() => false)) {
		await spinner.waitFor({state: 'hidden', timeout: 30000});
	}

	// Also wait for pending indicators in message cards
	const pendingIndicator = page.locator('text=Pending');
	if (await pendingIndicator.isVisible({timeout: 500}).catch(() => false)) {
		await pendingIndicator.waitFor({state: 'hidden', timeout: 30000});
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
		await input.fill('test');
		const sendButton = page.getByRole('button', {name: /send/i});
		await sendButton.click();

		// Connect using Dev Mode
		await connectWalletDevMode(page);

		// Wait for the input to be enabled (it's disabled during loading/connecting)
		await expect(input).toBeEnabled({timeout: 30000});

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
