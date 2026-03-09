import type {AsyncStorage} from './types';

export interface LocalStorageAdapterOptions<T> {
	/** Optional serializer, defaults to JSON.stringify */
	serialize?: (data: T) => string;
	/** Optional deserializer, defaults to JSON.parse */
	deserialize?: (data: string) => T;
}

export function createLocalStorageAdapter<T>(
	options?: LocalStorageAdapterOptions<T>,
): AsyncStorage<T> {
	const serialize = options?.serialize ?? JSON.stringify;
	const deserialize = (options?.deserialize ?? JSON.parse) as (
		data: string,
	) => T;

	return {
		async load(key: string): Promise<T | undefined> {
			try {
				const stored = localStorage.getItem(key);
				return stored ? deserialize(stored) : undefined;
			} catch {
				return undefined;
			}
		},

		async save(key: string, data: T): Promise<void> {
			try {
				localStorage.setItem(key, serialize(data));
			} catch {
				// Silently fail - localStorage might be full or unavailable
			}
		},

		async remove(key: string): Promise<void> {
			try {
				localStorage.removeItem(key);
			} catch {
				// Silently fail
			}
		},

		async exists(key: string): Promise<boolean> {
			try {
				return localStorage.getItem(key) !== null;
			} catch {
				return false;
			}
		},
	};
}
