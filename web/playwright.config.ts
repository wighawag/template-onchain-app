import {defineConfig, devices} from '@playwright/test';

/**
 * Playwright configuration for E2E tests.
 *
 * Tests run against a local Ethereum node with deployed contracts.
 * The global setup/teardown handles:
 * - Starting the Hardhat node
 * - Deploying contracts
 * - Building the web app
 * - Cleaning up after tests
 */
export default defineConfig({
	testDir: './e2e/tests',
	testMatch: '**/*.e2e.ts',

	// Global setup handles node startup, contract deployment, and web build
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',

	// Run tests in parallel by default
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 2 : 0,

	// Limit workers on CI
	workers: process.env.CI ? 1 : undefined,

	// Reporter to use
	reporter: [
		['html', {open: 'never'}],
		['list'],
		...(process.env.CI ? [['github'] as const] : []),
	],

	// Shared settings for all projects
	use: {
		baseURL: 'http://localhost:4173',

		// Collect trace when retrying the failed test
		trace: 'on-first-retry',

		// Capture screenshot on failure
		screenshot: 'only-on-failure',

		// Video recording on failure
		video: 'on-first-retry',
	},

	// Longer timeout for blockchain operations
	timeout: 60000,
	expect: {
		timeout: 10000,
	},

	// Configure projects for major browsers
	projects: [
		{
			name: 'chromium',
			use: {...devices['Desktop Chrome']},
		},
		// Uncomment to add more browsers
		// {
		// 	name: 'firefox',
		// 	use: {...devices['Desktop Firefox']},
		// },
		// {
		// 	name: 'webkit',
		// 	use: {...devices['Desktop Safari']},
		// },
	],

	// Web server configuration
	// NOTE: reuseExistingServer is false to ensure Playwright always starts a fresh
	// preview server with the newly built app from globalSetup.
	webServer: {
		command: 'pnpm run preview',
		port: 4173,
		reuseExistingServer: false,
		// Wait for the server to be ready
		timeout: 120000,
	},
});
