import {test, expect, describe} from '../fixtures/test';

describe('Home Page', () => {
	test('should display the icon', async ({page}) => {
		await page.goto('/');

		// Check for the icon image
		const icon = page.locator('img[alt="Jolly Roger"]');
		await expect(icon).toBeVisible();
	});

	test('should have a link to the demo page', async ({page}) => {
		await page.goto('/');

		// Find the "Check The Demo" button
		const demoButton = page.getByRole('link', {name: /check the demo/i});
		await expect(demoButton).toBeVisible();
		await expect(demoButton).toHaveAttribute('href', /\/demo/);
	});
});

describe('Home Page - Navigation', () => {
	test('should navigate to demo page and back', async ({page}) => {
		await page.goto('/');

		// Wait for the page to be fully loaded
		const demoLink = page.getByRole('link', {name: /check the demo/i});
		await expect(demoLink).toBeVisible({timeout: 10000});

		// Go to demo. A click during SvelteKit hydration can be swallowed (the
		// router installs its handler mid-flight), so retry until the URL changes.
		await expect(async () => {
			await demoLink.click();
			await page.waitForURL(/demo/, {timeout: 3000});
		}).toPass({timeout: 15000});

		// Verify we're on demo page by checking for the heading
		await expect(
			page.getByRole('heading', {name: /greetings registry/i}),
		).toBeVisible({timeout: 10000});

		// Navigate directly back to home using goto
		await page.goto('/');
		await page.waitForLoadState('load', {timeout: 15000});

		// Verify we're back on home page by checking for the Jolly Roger heading
		await expect(page.getByRole('heading', {name: /jolly roger/i})).toBeVisible(
			{timeout: 10000},
		);
	});
});
