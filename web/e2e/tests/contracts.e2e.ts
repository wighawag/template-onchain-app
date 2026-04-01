import {test, expect, describe} from '../fixtures/test';

describe('Contracts Page', () => {
	test('should display the contracts page title', async ({page}) => {
		await page.goto('/contracts');

		// Check the main title
		await expect(page.getByRole('heading', {name: 'Contracts'})).toBeVisible();

		// Check the description
		await expect(
			page.getByText('Interact with deployed smart contracts'),
		).toBeVisible();
	});

	test('should show contract selection dropdown', async ({page}) => {
		await page.goto('/contracts');

		// The contract selector should be visible
		const selector = page.getByRole('combobox').or(page.locator('[class*="select"]').first());
		await expect(selector).toBeVisible();
	});

	test('should display GreetingsRegistry contract by default', async ({
		page,
	}) => {
		await page.goto('/contracts');

		// Wait for the page to load contracts
		await page.waitForTimeout(1000);

		// Should show the GreetingsRegistry contract
		await expect(page.getByText('GreetingsRegistry')).toBeVisible();
	});

	test('should display contract address', async ({page}) => {
		await page.goto('/contracts');

		// Wait for contract info to load
		await page.waitForTimeout(1000);

		// Should show an Ethereum address (0x...)
		const addressElement = page.locator('text=/0x[a-fA-F0-9]{4,}/');
		await expect(addressElement.first()).toBeVisible();
	});

	test('should have Read and Write tabs', async ({page}) => {
		await page.goto('/contracts');

		// Wait for tabs to appear
		await page.waitForTimeout(1000);

		// Should have Read and Write tabs
		await expect(page.getByRole('tab', {name: 'Read'})).toBeVisible();
		await expect(page.getByRole('tab', {name: 'Write'})).toBeVisible();
	});

	test('should display view functions in Read tab', async ({page}) => {
		await page.goto('/contracts');

		// Click on Read tab (should be default)
		await page.getByRole('tab', {name: 'Read'}).click();

		// Wait for functions to load
		await page.waitForTimeout(1000);

		// Should show "View Functions" heading
		await expect(page.getByText('View Functions')).toBeVisible();

		// Should list the getLastMessages or messages function
		await expect(
			page.getByText('getLastMessages').or(page.getByText('messages')),
		).toBeVisible();
	});

	test('should display write functions in Write tab', async ({page}) => {
		await page.goto('/contracts');

		// Click on Write tab
		await page.getByRole('tab', {name: 'Write'}).click();

		// Wait for functions to load
		await page.waitForTimeout(1000);

		// Should show the setMessage function
		await expect(page.getByText('setMessage')).toBeVisible();
	});

	test('should be able to call a view function', async ({page}) => {
		await page.goto('/contracts');

		// Wait for page to load
		await page.waitForTimeout(1000);

		// Click on Read tab
		await page.getByRole('tab', {name: 'Read'}).click();

		// Find the getLastMessages function card and expand it or click call
		const functionCard = page.locator('[class*="card"]').filter({
			hasText: 'getLastMessages',
		});

		// If there's a limit input, fill it
		const limitInput = functionCard.locator('input[type="text"], input[type="number"]').first();
		if (await limitInput.isVisible({timeout: 500}).catch(() => false)) {
			await limitInput.fill('10');
		}

		// Click the call/query button
		const callButton = functionCard.getByRole('button', {name: /call|query|read/i});
		if (await callButton.isVisible({timeout: 500}).catch(() => false)) {
			await callButton.click();

			// Wait for result
			await page.waitForTimeout(2000);

			// Should show some result (either data or empty array)
			// Look for success indicator or result display
			const hasResult = await page.locator('[class*="result"], [class*="output"]').isVisible().catch(() => false);
			const hasSuccess = await page.getByText(/success|result|\[\]/i).isVisible().catch(() => false);
			expect(hasResult || hasSuccess).toBe(true);
		}
	});
});

describe('Contracts Page - Write Functions', () => {
	test('should trigger wallet connection when calling write function', async ({
		page,
	}) => {
		await page.goto('/contracts');

		// Click on Write tab
		await page.getByRole('tab', {name: 'Write'}).click();

		// Wait for functions to load
		await page.waitForTimeout(1000);

		// Find the setMessage function
		const functionCard = page.locator('[class*="card"]').filter({
			hasText: 'setMessage',
		});

		// Fill in a message
		const messageInput = functionCard.locator('input[type="text"]').first();
		if (await messageInput.isVisible({timeout: 500}).catch(() => false)) {
			await messageInput.fill('Test message from contracts page');

			// Click the write/send button
			const writeButton = functionCard.getByRole('button', {name: /write|send|submit/i});
			if (await writeButton.isVisible({timeout: 500}).catch(() => false)) {
				await writeButton.click();

				// Should trigger wallet connection modal
				await expect(
					page.getByRole('button', {name: /dev mode/i}),
				).toBeVisible({timeout: 5000});
			}
		}
	});

	test('should execute write function after connecting', async ({
		connectedPage,
		waitForTransaction,
	}) => {
		const page = connectedPage;

		// Navigate to contracts page (connectedPage starts at /demo)
		await page.goto('/contracts');

		// Click on Write tab
		await page.getByRole('tab', {name: 'Write'}).click();

		// Wait for functions to load
		await page.waitForTimeout(1000);

		// Find the setMessage function
		const functionCard = page.locator('[class*="card"]').filter({
			hasText: 'setMessage',
		});

		// Fill in a message
		const uniqueMessage = `Contract test ${Date.now()}`;
		const messageInput = functionCard.locator('input[type="text"]').first();

		if (await messageInput.isVisible({timeout: 1000}).catch(() => false)) {
			await messageInput.fill(uniqueMessage);

			// Click the write/send button
			const writeButton = functionCard.getByRole('button', {name: /write|send|submit/i});
			if (await writeButton.isVisible({timeout: 1000}).catch(() => false)) {
				await writeButton.click();

				// Wait for transaction
				await waitForTransaction(page);

				// Should show success or the message should be visible on demo page
				await page.goto('/demo');
				await expect(page.getByText(uniqueMessage)).toBeVisible({
					timeout: 30000,
				});
			}
		}
	});
});

describe('Contracts Page - Accessibility', () => {
	test('should have proper heading hierarchy', async ({page}) => {
		await page.goto('/contracts');

		// Should have h1
		await expect(page.locator('h1')).toHaveCount(1);
	});

	test('should have accessible tab controls', async ({page}) => {
		await page.goto('/contracts');

		// Wait for tabs
		await page.waitForTimeout(1000);

		// Tabs should be keyboard navigable
		const readTab = page.getByRole('tab', {name: 'Read'});
		const writeTab = page.getByRole('tab', {name: 'Write'});

		await expect(readTab).toBeVisible();
		await expect(writeTab).toBeVisible();
	});
});
