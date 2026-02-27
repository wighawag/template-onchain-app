import {createRouteHandler} from './core/utils/web/path';
import {
	getHashParamsFromLocation,
	getParamsFromLocation,
} from './core/utils/web/url';

import {createServiceWorker} from '$lib/core/service-worker';
import {createNotificationsService} from './core/notifications';
import {createContext} from 'svelte';
import type {Context} from './context/types';

export const hashParams = getHashParamsFromLocation();

const {params: paramFromLocation} = getParamsFromLocation();
export const {isParentRoute, isSameRoute, route, params} = createRouteHandler(
	paramFromLocation,
	{
		globalQueryParams: [
			'debug',
			'debugLevel',
			'traceLevel',
			'debugLabel',
			'eruda',
		] as const,
		// Dynamic routes that need hash-based URLs on path-based IPFS gateways
		dynamicRoutes: [
			{
				pattern: /^(\/explorer\/tx\/)(0x[a-fA-F0-9]+)\/?$/,
				basePath: '/explorer/tx/',
			},
			{
				pattern: /^(\/explorer\/address\/)(0x[a-fA-F0-9]+)\/?$/,
				basePath: '/explorer/address/',
			},
		],
	},
);

export const notifications = createNotificationsService();
export const serviceWorker = createServiceWorker(notifications);

const [getUserContextFunction, setUserContext] = createContext<() => Context>();

const getUserContext = () => getUserContextFunction()();
export {getUserContext, setUserContext};
