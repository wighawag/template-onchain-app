/**
 * Generic async storage interface for key-value persistence.
 * All operations are async to support various backends.
 */
export interface AsyncStorage<T> {
	/**
	 * Load data for the given key.
	 * @returns The stored data, or undefined if not found
	 */
	load(key: string): Promise<T | undefined>;

	/**
	 * Save data for the given key.
	 * @param key Storage key
	 * @param data Data to persist
	 */
	save(key: string, data: T): Promise<void>;

	/**
	 * Remove data for the given key.
	 * @param key Storage key
	 */
	remove(key: string): Promise<void>;

	/**
	 * Check if data exists for the given key.
	 * @param key Storage key
	 */
	exists(key: string): Promise<boolean>;
}
