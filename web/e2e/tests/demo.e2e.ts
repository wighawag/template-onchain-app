import {test, expect, describe} from '../fixtures/test';

describe('Demo Page - Greetings Registry', () => {
	test('should show input field for greeting', async ({page}) => {
		await page.goto('/demo');

		// Check that the greeting input is visible
		await expect(
			page.getByPlaceholder('Enter your greeting...'),
		).toBeVisible();

		// Check that the send button is visible
		await expect(page.getByRole('button', {name: /send/i})).toBeVisible();
	});

	test('should show send button as disabled when input is empty', async ({
		page,
	}) => {
		await page.goto('/demo');

		const sendButton = page.getByRole('button', {name: /send/i});

		// Button should be disabled when input is empty
		await expect(sendButton).toBeDisabled();

		// Type something
		await page.getByPlaceholder('Enter your greeting...').fill('Hello!');

		// Button should now be enabled
		await expect(sendButton).toBeEnabled();
	});

	test('should connect wallet and submit when clicking send', async ({
		page,
		fundWallets,
		waitForTransaction,
	}) => {
		// Fund wallets before testing
		await fundWallets();
		
		await page.goto('/demo');

		// Use a unique greeting for this test
		const uniqueGreeting = `Connect test ${Date.now()}`;
		
		// Fill in a greeting - use click then fill to ensure focus
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.click();
		await input.fill(uniqueGreeting);

		// Trigger input event to ensure Svelte reactivity
		await input.dispatchEvent('input');

		// Wait for the send button to be enabled
		const sendButton = page.getByRole('button', {name: /send/i});
		await expect(sendButton).toBeEnabled({timeout: 5000});

		// Click send - this will connect the wallet
		// When burner wallet is the only available wallet, it connects directly
		// without showing a wallet selection modal
		await sendButton.click();

		// Wait for the transaction to complete
		await waitForTransaction(page);

		// The greeting should appear in the messages list (look for exact text match in a message card)
		const messageCard = page.locator('[class*="rounded-lg border px-4 py-3"]').filter({
			hasText: uniqueGreeting,
		});
		await expect(messageCard).toBeVisible({timeout: 30000});
		
		// Wallet should now be connected (balance shown in navbar)
		const navbarBalance = page.locator('text=/\\d+\\.?\\d*\\s*ETH/');
		await expect(navbarBalance.first()).toBeVisible({timeout: 10000});
	});

	test('should show wallet as connected after submitting', async ({
		page,
		fundWallets,
		waitForTransaction,
	}) => {
		// Fund wallets before testing
		await fundWallets();
		
		await page.goto('/demo');

		// Wait for the page to fully load
		const input = page.getByPlaceholder('Enter your greeting...');
		await expect(input).toBeVisible({timeout: 10000});

		// Use unique greeting for this test
		const uniqueGreeting = `Wallet test ${Date.now()}`;
		
		// Fill in a greeting - click first to ensure the input is ready
		await input.click();
		await input.fill(uniqueGreeting);
		await input.dispatchEvent('input');

		// Wait for the send button to be enabled and click it
		const sendButton = page.getByRole('button', {name: /send/i});
		await expect(sendButton).toBeEnabled({timeout: 10000});
		await sendButton.click();

		// Wait for transaction
		await waitForTransaction(page);

		// After connection and transaction, the wallet balance should be visible
		// This confirms the wallet is connected
		const navbarBalance = page.locator('text=/\\d+\\.?\\d*\\s*ETH/');
		await expect(navbarBalance.first()).toBeVisible({timeout: 10000});
	});

	test('should submit a greeting and see it in the list', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;

		// Generate a unique greeting to find it in the list
		const uniqueGreeting = `E2E Test ${Date.now()}`;

		// Fill in the greeting
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.fill(uniqueGreeting);

		// Submit
		await page.getByRole('button', {name: /send/i}).click();

		// Wait for the transaction to be processed
		await waitForTransaction(page);

		// The greeting should appear in the list (with the prefix from the contract)
		// The contract prepends "prefix:" to all messages
		await expect(page.getByText(uniqueGreeting)).toBeVisible({
			timeout: 30000,
		});
	});

	test('should display existing messages with avatars', async ({page}) => {
		await page.goto('/demo');

		// Wait for messages to load
		const messageCard = page.locator('[class*="rounded-lg border px-4 py-3"]');

		// If there are messages, they should have avatars
		try {
			await messageCard.first().waitFor({state: 'visible', timeout: 15000});
			// Check that avatar is present
			const avatar = messageCard.first().locator('img, svg, canvas');
			await expect(avatar.first()).toBeVisible();
		} catch {
			// No messages yet, that's okay - check for empty state
			await expect(page.getByText('No messages yet')).toBeVisible();
		}
	});

	test('should show "Just now" for recent messages', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;

		// Submit a new greeting
		const uniqueGreeting = `Fresh message ${Date.now()}`;
		await page.getByPlaceholder('Enter your greeting...').fill(uniqueGreeting);
		await page.getByRole('button', {name: /send/i}).click();

		// Wait for transaction
		await waitForTransaction(page);

		// Find the message and check timestamp shows "Just now"
		const messageContainer = page.locator('[class*="rounded-lg border px-4 py-3"]').filter({
			hasText: uniqueGreeting,
		});
		await expect(messageContainer.getByText('Just now')).toBeVisible({
			timeout: 30000,
		});
	});

	test('should clear input after successful submission', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;

		const uniqueMessage = `Clear test ${Date.now()}`;
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.fill(uniqueMessage);
		await page.getByRole('button', {name: /send/i}).click();

		// Wait for transaction
		await waitForTransaction(page);

		// Wait for the message to appear (confirms transaction completed)
		const messageCard = page.locator('[class*="rounded-lg border px-4 py-3"]').filter({
			hasText: uniqueMessage,
		});
		await expect(messageCard).toBeVisible({timeout: 30000});

		// Input should be cleared after successful submission
		// Give extra time for the UI to update
		await expect(input).toHaveValue('', {timeout: 15000});
	});

	test('should replace previous message from same account', async ({connectedPage, waitForTransaction}) => {
		const page = connectedPage;

		// The contract allows only ONE message per account - new messages replace old ones
		const timestamp = Date.now();
		const message1 = `First ${timestamp}`;
		const message2 = `Second ${timestamp}`;

		// Submit first message
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.fill(message1);
		await page.getByRole('button', {name: /send/i}).click();
		await waitForTransaction(page);

		// Wait for first message to appear in a message card
		const messageCard1 = page.locator('[class*="rounded-lg border px-4 py-3"]').filter({
			hasText: message1,
		});
		await expect(messageCard1).toBeVisible({timeout: 30000});

		// Submit second message (this REPLACES the first message)
		await input.fill(message2);
		await page.getByRole('button', {name: /send/i}).click();
		await waitForTransaction(page);

		// Wait for second message to appear
		const messageCard2 = page.locator('[class*="rounded-lg border px-4 py-3"]').filter({
			hasText: message2,
		});
		await expect(messageCard2).toBeVisible({timeout: 30000});

		// The first message should NO LONGER be visible (replaced by second)
		await expect(messageCard1).not.toBeVisible({timeout: 5000});

		// The most recent message from this account should be visible at the top
		const messageCards = page.locator('[class*="rounded-lg border px-4 py-3"]');
		const firstMessageText = await messageCards.first().textContent();
		expect(firstMessageText).toContain(message2);
	});
});

describe('Demo Page - Accessibility', () => {
	test('should have proper heading hierarchy', async ({page}) => {
		await page.goto('/demo');

		// There should be exactly one h1
		await expect(page.locator('h1')).toHaveCount(1);
	});

	test('should have accessible form elements', async ({page}) => {
		await page.goto('/demo');

		// Input should have a placeholder (acts as label)
		const input = page.getByPlaceholder('Enter your greeting...');
		await expect(input).toBeVisible();

		// Button should be accessible
		const button = page.getByRole('button', {name: /send/i});
		await expect(button).toBeVisible();
	});
});
