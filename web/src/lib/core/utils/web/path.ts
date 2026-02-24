import {resolve} from '$app/paths';
import {getParamsFromURL, queryStringifyNoArray} from './url.js';

export function createRouteHandler<T extends readonly string[]>(
	params: Record<string, string>,
	globalQueryParams: T,
) {
	function route(p: string, hash?: string) {
		if (!p.endsWith('/')) {
			p += '/';
		}
		const pathToResolve = `${p}${getQueryStringToKeep(p)}${hash ? `#${hash}` : ''}`;
		let path = resolve<any>(pathToResolve);
		return path;
	}

	function getQueryStringToKeep(p: string): string {
		if (globalQueryParams && globalQueryParams.length > 0) {
			const {params: paramFromPath} = getParamsFromURL(p);
			for (const queryParam of globalQueryParams) {
				if (
					typeof params[queryParam] != 'undefined' &&
					typeof paramFromPath[queryParam] === 'undefined'
				) {
					paramFromPath[queryParam] = params[queryParam];
				}
			}
			return queryStringifyNoArray(paramFromPath);
		} else {
			return '';
		}
	}

	function isSameRoute(a: string, b: string): boolean {
		return a === b || a === route(b);
	}

	function isParentRoute(a: string, b: string): boolean {
		return a.startsWith(b) || a.startsWith(route(b));
	}

	return {route, isSameRoute, isParentRoute, params: params as Record<T[number], string | undefined>};
}

export function url(p: string, hash?: string) {
	return resolve<any>(
		hash ? `${p}${hash.startsWith('#') ? hash : `#${hash}`}` : p,
	);
}
