import {
	test as base,
	expect,
	type Page,
	type BrowserContext,
} from '@playwright/test';

/**
 * Extended test fixtures for E2E testing with wallet interactions.
 *
 * Each test starts with a clean browser state:
 * 1. playwright.config.ts sets storageState: {cookies: [], origins: []} for initial state
 * 2. This fixture creates a fresh context and clears localStorage on the target origin
 *    before any test code runs, ensuring complete isolation from auto-connect behavior
 */

// The addresses that can be impersonated via the burner wallet
// These are configured in web/src/lib/context/index.ts
const IMPERSONATE_ADDRESSES = [
	'0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // Vitalik
	'0xF78cD306b23031dE9E739A5BcDE61764e82AD5eF',
];

// Hardhat node URL
const HARDHAT_RPC_URL = 'http://localhost:8545';

// Base URL for the web app (matches playwright.config.ts)
const BASE_URL = 'http://localhost:4173';

/**
 * Fund an address using Hardhat's hardhat_setBalance RPC method.
 * This is useful for tests where we need to ensure the wallet has ETH.
 */
async function fundAddressViaHardhat(
	address: string,
	amountInEth = '100',
): Promise<void> {
	// Convert ETH to wei (hex)
	const weiAmount = BigInt(parseFloat(amountInEth) * 1e18);
	const hexAmount = '0x' + weiAmount.toString(16);

	const response = await fetch(HARDHAT_RPC_URL, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			jsonrpc: '2.0',
			method: 'hardhat_setBalance',
			params: [address, hexAmount],
			id: 1,
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to set balance: ${response.statusText}`);
	}
}

export interface WalletFixtures {
	/**
	 * Page with clean localStorage - starts with no wallet connection state.
	 * This overrides the default page fixture to ensure test isolation.
	 */
	page: Page;

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

	/**
	 * Ensures the test wallet addresses have ETH on the Hardhat node.
	 * Call this before tests that need funded wallets.
	 */
	fundWallets: () => Promise<void>;
}

/**
 * Clear all browser storage (localStorage, sessionStorage) on the target origin.
 * This is called after navigating to the origin to ensure clean state.
 */
async function clearBrowserStorage(page: Page): Promise<void> {
	await page.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
}

/**
 * Connect wallet using Dev Mode (burner wallet with test mnemonic).
 * Also handles the case where wallet is already auto-connected but needs funding.
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
		// Modal might not have appeared if already connected via auto-connect
		console.log('Wallet may already be connected via auto-connect');
	}

	// Handle Insufficient Funds modal - click "Get ETH" to use the faucet API
	await handleInsufficientFundsModal(page);
}

/**
 * Handle the Insufficient Funds modal by clicking "Get ETH" and then "Continue Transaction".
 * This modal appears when the wallet is connected but doesn't have enough ETH.
 */
async function handleInsufficientFundsModal(page: Page): Promise<void> {
	const getEthButton = page.getByRole('button', {name: /get eth/i});

	try {
		// Wait for the button to exist in the DOM
		await getEthButton.waitFor({state: 'attached', timeout: 5000});

		// Wait for it to be enabled (not loading)
		await expect(getEthButton).toBeEnabled({timeout: 30000});

		// Click "Get ETH" - this will call the faucet API
		await getEthButton.click();

		// Wait for "Continue Transaction" button to appear and be enabled
		const continueButton = page.getByRole('button', {
			name: /continue transaction/i,
		});
		await continueButton.waitFor({state: 'visible', timeout: 30000});
		await expect(continueButton).toBeEnabled({timeout: 10000});

		// Click "Continue Transaction" to proceed with the original transaction
		await continueButton.click();

		// Wait for the modal to close
		await page.waitForFunction(
			() => {
				const modal = document.querySelector('[role="dialog"]');
				return !modal || !modal.textContent?.includes('Funds');
			},
			{timeout: 10000},
		);
	} catch {
		// No insufficient funds modal or already handled
	}
}

/**
 * Wait for any pending transaction to be confirmed.
 * First waits for a pending indicator to appear (showing tx started),
 * then waits for all pending indicators to disappear (showing tx completed).
 */
async function waitForTransactionComplete(page: Page): Promise<void> {
	// First, wait for pending indicator to APPEAR (transaction started)
	// This ensures we don't return early if the transaction hasn't started yet
	try {
		await page.waitForFunction(
			() => {
				const pendingElements = document.querySelectorAll(
					'[class*="animate-spin"], [class*="Pending"]',
				);
				const pendingText = document.body.textContent?.includes(
					'Transaction pending',
				);
				return pendingElements.length > 0 || pendingText;
			},
			{timeout: 10000},
		);
	} catch {
		// Pending indicator might not appear if tx is very fast
		// Continue anyway and check for completion
	}

	// Then wait for ALL pending indicators to disappear (transaction completed)
	try {
		await page.waitForFunction(
			() => {
				const pendingElements = document.querySelectorAll(
					'[class*="animate-spin"], [class*="Pending"]',
				);
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
	 * Override the default page fixture to ensure each test starts with clean storage.
	 *
	 * This creates a fresh browser context with empty storage state for each test,
	 * then navigates to the app to clear any storage on the correct origin,
	 * ensuring no previous wallet connection state persists between tests.
	 */
	page: async ({browser}, use) => {
		// Create a fresh context for this test with empty storage
		const context = await browser.newContext({
			storageState: {cookies: [], origins: []},
		});

		const page = await context.newPage();

		// Navigate to the app origin to establish context, then clear storage
		await page.goto(BASE_URL, {waitUntil: 'commit'});
		await page.evaluate(() => {
			localStorage.clear();
			sessionStorage.clear();
		});

		// Navigate away so the test's navigation starts fresh
		await page.goto('about:blank');

		await use(page);
		await context.close();
	},

	/**
	 * Fund wallet addresses via Hardhat RPC before tests.
	 */
	fundWallets: async ({}, use) => {
		const fundAll = async () => {
			for (const address of IMPERSONATE_ADDRESSES) {
				await fundAddressViaHardhat(address, '100');
			}
		};
		await use(fundAll);
	},

	/**
	 * Provides a page that's already connected to a wallet.
	 * Usage:
	 *   test('my test', async ({ connectedPage }) => { ... })
	 */
	connectedPage: async ({page, fundWallets}, use) => {
		// Fund the wallet addresses BEFORE navigating to the page
		// This ensures the wallet has ETH when the app auto-connects
		await fundWallets();

		// Navigate to demo page
		await page.goto('/demo');

		// Wait for app to initialize
		await page.waitForSelector('input[placeholder="Enter your greeting..."]', {
			timeout: 30000,
		});

		// Trigger connection by clicking send (this will open the modal)
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.click();
		await input.fill('fixture-connection-test');

		// Wait for the button to be enabled after filling the input
		const sendButton = page.getByRole('button', {name: /send/i});
		await expect(sendButton).toBeEnabled({timeout: 5000});
		await sendButton.click();

		// Connect using Dev Mode (handles both connection modal and funding if needed)
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
	connectWallet: async ({fundWallets}, use) => {
		// Ensure wallets are funded before connecting
		await fundWallets();
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
