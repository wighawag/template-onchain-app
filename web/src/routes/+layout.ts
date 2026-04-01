import {get} from 'svelte/store';
import {onDocumentLoaded} from '$lib/core/utils/web/hooks.js';
import {dev, version} from '$app/environment';
import {serviceWorker} from '$lib';

import {logs} from 'named-logs';

const logger = logs('init');

logger.debug(`initialization...`);

export const prerender = true;
export const trailingSlash = 'always';
export const ssr = true;

console.log(`VERSION: ${version}`);

if (!dev) {
	// TODO add option to enable service-worker in dev mode
	onDocumentLoaded(serviceWorker.register);
} else {
	console.warn(
		`skipping service-worker registration in dev mode, see src/routes/+layout.ts`,
	);
}

// Dev/debug: attaching svelte store get() for console access
(globalThis as any).get = get;
