import {test, expect, describe} from '../fixtures/test';

describe('Demo Page - Greetings Registry', () => {
	test('should show input field for greeting', async ({page}) => {
		await page.goto('/demo');

		// Check that the greeting input is visible
		await expect(page.getByPlaceholder('Enter your greeting...')).toBeVisible();

		// Check that the send button is visible
		await expect(page.getByRole('button', {name: /send/i})).toBeVisible();
	});

	test('should show send button as disabled when input is empty', async ({
		page,
	}) => {
		await page.goto('/demo');

		// Wait for the input to be visible first
		await expect(page.getByPlaceholder('Enter your greeting...')).toBeVisible({
			timeout: 10000,
		});

		const sendButton = page.getByRole('button', {name: /send/i});

		// Button should be disabled when input is empty
		await expect(sendButton).toBeDisabled();

		// Type something
		await page.getByPlaceholder('Enter your greeting...').fill('Hello!');

		// Button should now be enabled
		await expect(sendButton).toBeEnabled();
	});

	test('should connect wallet and submit when clicking send', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;

		// Use a unique greeting for this test
		const uniqueGreeting = `Connect test ${Date.now()}`;

		// Fill in a greeting
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.fill(uniqueGreeting);

		// Wait for the send button to be enabled
		const sendButton = page.getByRole('button', {name: /send/i});
		await expect(sendButton).toBeEnabled({timeout: 10000});

		// Click send
		await sendButton.click();

		// Wait for the transaction to complete
		await waitForTransaction(page);

		// The greeting should appear in the messages list
		const messageCard = page
			.locator('[class*="rounded-lg border px-4 py-3"]')
			.filter({
				hasText: uniqueGreeting,
			});
		await expect(messageCard).toBeVisible({timeout: 60000});

		// Wallet should be connected (balance shown in navbar)
		const navbarBalance = page.locator('text=/\\d+\\.?\\d*\\s*ETH/');
		await expect(navbarBalance.first()).toBeVisible({timeout: 10000});
	});

	test('should show wallet as connected after submitting', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;

		// Use unique greeting for this test
		const uniqueGreeting = `Wallet test ${Date.now()}`;

		// Fill in a greeting
		const input = page.getByPlaceholder('Enter your greeting...');
		await input.fill(uniqueGreeting);

		// Wait for the send button to be enabled and click it
		const sendButton = page.getByRole('button', {name: /send/i});
		await expect(sendButton).toBeEnabled({timeout: 10000});
		await sendButton.click();

		// Wait for transaction
		await waitForTransaction(page);

		// After connection and transaction, the wallet balance should be visible
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

		// Wait for the page to fully load (not just loading state)
		await page.waitForLoadState('networkidle', {timeout: 30000});
		
		// Wait for either messages or the input field to be visible
		await expect(page.getByPlaceholder('Enter your greeting...')).toBeVisible({
			timeout: 10000,
		});

		// Check for message cards
		const messageCard = page.locator('[class*="rounded-lg border px-4 py-3"]');

		// Wait for either messages to appear or the empty state
		const hasMessages = await messageCard
			.first()
			.isVisible({timeout: 15000})
			.catch(() => false);

		if (hasMessages) {
			// Check that the message card has an image element (avatar)
			const firstCard = messageCard.first();
			const imgCount = await firstCard.locator('img').count();
			expect(imgCount).toBeGreaterThanOrEqual(1);
		} else {
			// Empty state - check for text indicating no messages
			// The page shows "No messages yet. Be the first!" when empty
			const hasNoMessagesText = await page
				.getByText(/no messages yet/i)
				.isVisible()
				.catch(() => false);
			const hasBeFirstText = await page
				.getByText(/be the first/i)
				.isVisible()
				.catch(() => false);
			expect(hasNoMessagesText || hasBeFirstText).toBe(true);
		}
	});

	test('should show "Just now" for recent messages', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;
		const input = page.getByPlaceholder('Enter your greeting...');
		
		// Ensure input is ready
		await expect(input).toBeVisible({timeout: 10000});

		// Submit a new greeting
		const uniqueGreeting = `Fresh message ${Date.now()}`;
		await input.fill(uniqueGreeting);
		
		// Click send button
		const sendButton = page.getByRole('button', {name: /send/i});
		await expect(sendButton).toBeEnabled({timeout: 10000});
		await sendButton.click();

		// Wait for transaction
		await waitForTransaction(page);

		// Wait for the message to appear in the list
		await expect(page.getByText(uniqueGreeting)).toBeVisible({timeout: 30000});

		// Check timestamp shows "Just now"
		await expect(page.getByText('Just now').first()).toBeVisible({timeout: 10000});
	});

	test('should clear input after successful submission', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;
		const input = page.getByPlaceholder('Enter your greeting...');
		
		// Ensure input is ready and clear any existing value
		await expect(input).toBeVisible({timeout: 10000});
		await input.clear();
		await page.waitForTimeout(200);

		const uniqueMessage = `Clear test ${Date.now()}`;
		await input.fill(uniqueMessage);
		
		// Click send button
		const sendButton = page.getByRole('button', {name: /send/i});
		await expect(sendButton).toBeEnabled({timeout: 10000});
		await sendButton.click();

		// Wait for transaction
		await waitForTransaction(page);

		// Wait for the message to appear (confirms transaction completed)
		// Messages are sorted by most recent first
		await expect(page.getByText(uniqueMessage)).toBeVisible({timeout: 30000});

		// Wait for input to be enabled (it's disabled during submission)
		await expect(input).toBeEnabled({timeout: 10000});
		
		// Input should be cleared after successful submission
		// Wait longer for Svelte reactivity to update the binding
		await expect(input).toHaveValue('', {timeout: 20000});
	});

	test('should replace previous message from same account', async ({
		connectedPage,
		waitForTransaction,
	}) => {
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
		const messageCard1 = page
			.locator('[class*="rounded-lg border px-4 py-3"]')
			.filter({
				hasText: message1,
			});
		await expect(messageCard1).toBeVisible({timeout: 30000});

		// Submit second message (this REPLACES the first message)
		await input.fill(message2);
		await page.getByRole('button', {name: /send/i}).click();
		await waitForTransaction(page);

		// Wait for second message to appear
		const messageCard2 = page
			.locator('[class*="rounded-lg border px-4 py-3"]')
			.filter({
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
