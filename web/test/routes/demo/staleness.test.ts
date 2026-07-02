import {describe, it, expect} from 'vitest';
import {
	formatRelativeTime,
	getStaleMessage,
	STALE_THRESHOLD_MS,
} from '../../../src/routes/demo/lib/staleness';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
	it("returns 'Just now' under a minute", () => {
		expect(formatRelativeTime(1000, 1000 + 30 * SECOND)).toBe('Just now');
	});

	it('formats minutes/hours/days with pluralisation', () => {
		const base = 1_000_000;
		expect(formatRelativeTime(base, base + 1 * MINUTE)).toBe('1 minute ago');
		expect(formatRelativeTime(base, base + 5 * MINUTE)).toBe('5 minutes ago');
		expect(formatRelativeTime(base, base + 1 * HOUR)).toBe('1 hour ago');
		expect(formatRelativeTime(base, base + 3 * HOUR)).toBe('3 hours ago');
		expect(formatRelativeTime(base, base + 1 * DAY)).toBe('1 day ago');
		expect(formatRelativeTime(base, base + 2 * DAY)).toBe('2 days ago');
	});
});

describe('getStaleMessage', () => {
	it('returns undefined when there is no successful fetch', () => {
		expect(getStaleMessage(undefined, 10_000)).toBeUndefined();
	});

	it('returns undefined while data is still fresh', () => {
		const now = 1_000_000;
		expect(getStaleMessage(now - (STALE_THRESHOLD_MS - 1), now)).toBeUndefined();
	});

	it('reports seconds/minutes/hours once stale', () => {
		const now = 1_000_000;
		expect(getStaleMessage(now - STALE_THRESHOLD_MS, now)).toBe(
			'Data is 30 seconds old',
		);
		expect(getStaleMessage(now - 5 * MINUTE, now)).toBe('Data is 5 minutes old');
		expect(getStaleMessage(now - 1 * MINUTE, now)).toBe('Data is 1 minute old');
		expect(getStaleMessage(now - 2 * HOUR, now)).toBe('Data is 2 hours old');
		expect(getStaleMessage(now - 1 * HOUR, now)).toBe('Data is 1 hour old');
	});
});
