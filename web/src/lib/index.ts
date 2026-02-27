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
	['debug', 'debugLevel', 'traceLevel', 'debugLabel', 'eruda'] as const,
);

export const notifications = createNotificationsService();
export const serviceWorker = createServiceWorker(notifications);

const [getUserContextFunction, setUserContext] = createContext<() => Context>();

const getUserContext = () => getUserContextFunction()();
export {getUserContext, setUserContext};
