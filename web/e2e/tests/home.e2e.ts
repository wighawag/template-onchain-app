import {test, expect, describe} from '../fixtures/test';

describe('Home Page', () => {
	test('should display the Jolly Roger branding', async ({page}) => {
		await page.goto('/');

		// Check the main title
		await expect(
			page.getByRole('heading', {name: 'Jolly Roger'}),
		).toBeVisible();
	});

	test('should display the tagline', async ({page}) => {
		await page.goto('/');

		// Check for the tagline text
		await expect(page.getByText('Build')).toBeVisible();
		await expect(page.getByText('Deploy')).toBeVisible();
		await expect(page.getByText('Eternity')).toBeVisible();
	});

	test('should display the icon', async ({page}) => {
		await page.goto('/');

		// Check for the icon image
		const icon = page.locator('img[alt="Jolly Roger"]');
		await expect(icon).toBeVisible();
	});

	test('should have a link to the demo page', async ({page}) => {
		await page.goto('/');

		// Find and click the "Check The Demo" button
		const demoButton = page.getByRole('link', {name: /check the demo/i});
		await expect(demoButton).toBeVisible();

		// Click it and verify navigation
		await demoButton.click();
		await expect(page).toHaveURL('/demo/');
	});

	test('should have rotating words animation', async ({page}) => {
		await page.goto('/');

		// The page shows rotating words: Idea, Game, App
		// At least one should be visible
		await expect(
			page.getByText('Idea').or(page.getByText('Game')).or(page.getByText('App')),
		).toBeVisible();
	});
});

describe('Home Page - Navigation', () => {
	test('should navigate to demo page and back', async ({page}) => {
		await page.goto('/');

		// Go to demo
		await page.getByRole('link', {name: /check the demo/i}).click();
		await expect(page).toHaveURL('/demo/');

		// Go back
		await page.goBack();
		await expect(page).toHaveURL('/');
	});
});
