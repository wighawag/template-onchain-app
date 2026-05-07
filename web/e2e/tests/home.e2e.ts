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
		await expect(page.getByRole('link', {name: /check the demo/i})).toBeVisible({
			timeout: 10000,
		});

		// Go to demo
		await page.getByRole('link', {name: /check the demo/i}).click();
		await page.waitForURL(/demo/, {timeout: 15000});
		
		// Check URL contains demo
		expect(page.url()).toContain('/demo');

		// Go back
		await page.goBack();
		await page.waitForURL(/^http:\/\/localhost:4173\/?$/, {timeout: 15000});
		
		// Check we're back on home
		expect(page.url()).toMatch(/^http:\/\/localhost:4173\/?$/);
	});
});
