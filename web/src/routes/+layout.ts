import {get} from 'svelte/store';
import {onDocumentLoaded} from '$lib/core/utils/web/hooks.js';
import {dev, version} from '$app/environment';
import {serviceWorker, params} from '$lib';

export const prerender = true;
export const trailingSlash = 'always';
export const ssr = true;

console.log(`VERSION: ${version}`);

if (!dev) {
	// TODO add option to enable it in dev
	onDocumentLoaded(serviceWorker.register);
} else {
	console.warn(
		`skipping service-worker registration in dev mode, see src/routes/+layout.ts`,
	);
}

// add global method to get current state of a svelte store
(globalThis as any).get = get;
