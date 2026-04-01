import {defineConfig, devices} from '@playwright/test';

const env = (globalThis as any).process.env;

/**
 * Playwright configuration for E2E tests.
 *
 * Tests run against a local Ethereum node with deployed contracts.
 *
 * Use scripts/run-e2e-tests.sh to run the full E2E test suite which handles:
 * - Starting the Hardhat node
 * - Deploying contracts
 * - Building the web app
 * - Running these tests
 * - Cleaning up after tests
 *
 * Or use pnpm test:e2e which runs the script automatically.
 */
export default defineConfig({
	testDir: './e2e/tests',
	testMatch: '**/*.e2e.ts',

	// Run tests in parallel by default
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!env.CI,

	// Retry on CI only
	retries: env.CI ? 2 : 0,

	// Limit workers on CI
	workers: env.CI ? 1 : undefined,

	// Reporter to use
	reporter: [
		['html', {open: 'never'}],
		['list'],
		...(env.CI ? [['github'] as const] : []),
	],

	// Shared settings for all projects
	use: {
		baseURL: 'http://localhost:4173',

		// Start each test with empty storage state (no cookies, no localStorage)
		// This ensures tests don't inherit wallet connection state from previous runs
		storageState: {cookies: [], origins: []},

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
