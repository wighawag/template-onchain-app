/**
 * Presentational time helpers for the demo greetings list.
 *
 * These are pure functions (no store/context access) so they can be unit
 * tested and reused. The `.svelte` file only calls them with `clock.now()`.
 */

/** Only surface a staleness warning once data is older than this. */
export const STALE_THRESHOLD_MS = 30_000;

/**
 * Human-readable "time ago" for a message timestamp.
 * Returns 'Just now' for anything under a minute.
 */
export function formatRelativeTime(timestamp: number, now: number): string {
	const diff = now - timestamp;

	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
	if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
	if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
	return 'Just now';
}

/**
 * Message shown when the last successful fetch is older than
 * {@link STALE_THRESHOLD_MS}. Returns undefined when there is no successful
 * fetch yet, or when the data is still fresh.
 */
export function getStaleMessage(
	lastSuccessfulFetch: number | undefined,
	now: number,
): string | undefined {
	if (!lastSuccessfulFetch) return undefined;

	const diff = now - lastSuccessfulFetch;
	const seconds = Math.floor(diff / 1000);

	if (diff < STALE_THRESHOLD_MS) return undefined;

	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) return `Data is ${hours} hour${hours > 1 ? 's' : ''} old`;
	if (minutes > 0)
		return `Data is ${minutes} minute${minutes > 1 ? 's' : ''} old`;
	return `Data is ${seconds} seconds old`;
}
