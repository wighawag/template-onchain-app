import {defineConfig} from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'pnpm run build localhost && pnpm run preview',
		port: 4173,
	},
	testMatch: '**/*.e2e.{ts,js}',
});
