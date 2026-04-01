import {test, expect, describe} from '../fixtures/test';

describe('Demo Page - Greetings Registry', () => {
	test('should display the page title and description', async ({page}) => {
		await page.goto('/demo');

		// Check the main heading
		await expect(
			page.getByRole('heading', {name: 'Greetings Registry'}),
		).toBeVisible();

		// Check the description text
		await expect(
			page.getByText('This is a demo of a simple on-chain greetings registry'),
		).toBeVisible();
	});

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

	test('should trigger wallet connection modal when submitting', async ({
		page,
	}) => {
		await page.goto('/demo');

		// Fill in a greeting
		await page.getByPlaceholder('Enter your greeting...').fill('Test greeting');

		// Click send
		await page.getByRole('button', {name: /send/i}).click();

		// Should show the wallet connection modal
		// Look for the Dev Mode button which indicates the modal is open
		await expect(
			page.getByRole('button', {name: /dev mode/i}),
		).toBeVisible({timeout: 5000});
	});

	test('should connect wallet using Dev Mode', async ({
		page,
		connectWallet,
	}) => {
		await page.goto('/demo');

		// Fill in a greeting to trigger connection
		await page.getByPlaceholder('Enter your greeting...').fill('Test greeting');
		await page.getByRole('button', {name: /send/i}).click();

		// Connect using Dev Mode
		await connectWallet(page);

		// After connection, the modal should close
		// The Dev Mode button should no longer be visible
		await expect(
			page.getByRole('button', {name: /dev mode/i}),
		).not.toBeVisible({timeout: 10000});
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

	test('should display loading state while fetching messages', async ({
		page,
	}) => {
		await page.goto('/demo');

		// The page should show either:
		// 1. Loading spinner (if still fetching)
		// 2. Messages (if already loaded)
		// 3. "No messages yet" (if empty)

		// Wait for either the loaded state or loading indicator
		await expect(
			page
				.getByText('Loading messages...')
				.or(page.getByText('No messages yet'))
				.or(page.locator('[class*="rounded-lg border px-4 py-3"]').first()),
		).toBeVisible({timeout: 30000});
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

		const input = page.getByPlaceholder('Enter your greeting...');
		await input.fill('Clear test message');
		await page.getByRole('button', {name: /send/i}).click();

		// Wait for transaction
		await waitForTransaction(page);

		// Input should be cleared
		await expect(input).toHaveValue('');
	});

	test('should show multiple messages in order', async ({connectedPage, waitForTransaction}) => {
		const page = connectedPage;

		// Submit two messages
		const message1 = `First message ${Date.now()}`;
		const message2 = `Second message ${Date.now() + 1}`;

		// Submit first message
		await page.getByPlaceholder('Enter your greeting...').fill(message1);
		await page.getByRole('button', {name: /send/i}).click();
		await waitForTransaction(page);

		// Submit second message
		await page.getByPlaceholder('Enter your greeting...').fill(message2);
		await page.getByRole('button', {name: /send/i}).click();
		await waitForTransaction(page);

		// Both messages should be visible
		await expect(page.getByText(message1)).toBeVisible();
		await expect(page.getByText(message2)).toBeVisible();

		// Get all message cards
		const messageCards = page.locator('[class*="rounded-lg border px-4 py-3"]');
		const count = await messageCards.count();

		// There should be at least 2 messages
		expect(count).toBeGreaterThanOrEqual(2);

		// The most recent message should appear first (newest first order)
		const firstMessageText = await messageCards.first().textContent();
		expect(firstMessageText).toContain(message2);
	});
});

describe('Demo Page - Error Handling', () => {
	test('should handle network errors gracefully', async ({page}) => {
		// Go to the demo page
		await page.goto('/demo');

		// Wait for initial load - either messages loaded, no messages, or loading state
		await expect(
			page
				.locator('[class*="rounded-lg border px-4 py-3"]').first()
				.or(page.getByText('No messages yet'))
				.or(page.getByText('Loading messages...')),
		).toBeVisible({timeout: 30000});

		// Now simulate network failure by blocking API calls
		await page.route('**/*', (route) => {
			if (route.request().url().includes('localhost:8545')) {
				route.abort('connectionfailed');
			} else {
				route.continue();
			}
		});

		// Wait a bit for the next fetch attempt to fail
		await page.waitForTimeout(6000);

		// The page should show an error or stale data indicator
		// Either "Refresh failed" or stale message indicator
		const hasError = await page.getByText(/refresh failed|error|stale/i).isVisible().catch(() => false);
		const hasRetryButton = await page.getByRole('button', {name: /retry/i}).isVisible().catch(() => false);

		// Should show either an error message or retry button
		expect(hasError || hasRetryButton).toBe(true);
	});
});

describe('Demo Page - Accessibility', () => {
	test('should have proper heading hierarchy', async ({page}) => {
		await page.goto('/demo');

		// There should be an h1
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('h1')).toContainText('Greetings Registry');
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
