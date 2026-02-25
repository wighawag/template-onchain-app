import {createRouteHandler} from './core/utils/web/path';
import {
	getHashParamsFromLocation,
	getParamsFromLocation,
} from './core/utils/web/url';
import {createServiceWorker} from '$lib/core/service-worker';
import {createNotificationsService} from './core/notifications';
import {createContext} from 'svelte';
import type {Dependencies} from './types';

export const hashParams = getHashParamsFromLocation();

const {params: paramFromLocation} = getParamsFromLocation();
export const {isParentRoute, isSameRoute, route, params} = createRouteHandler(
	paramFromLocation,
	['debug', 'debugLevel', 'traceLevel', 'debugLabel', 'eruda'] as const,
);

export const notifications = createNotificationsService();
export const serviceWorker = createServiceWorker(notifications);

// notifications.add({
// 	title: 'hello world',
// 	body: 'sdsa dsad sad sakd jsakd sd sadjsakdjsak dsakdj sakjd ksdj',
// 	action: {
// 		label: 'do it',
// 		command: () => {
// 			console.log('hello world');
// 		},
// 	},
// });

const [getUserContextFunction, setUserContext] =
	createContext<() => Dependencies>();

const getUserContext = () => getUserContextFunction()();
export {getUserContext, setUserContext};
