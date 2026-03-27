import type { LeaderLock } from './types.js';

const LOCK_KEY = 'tx-observer-leader-lock';

export function readLock(): LeaderLock | null {
	try {
		const raw = localStorage.getItem(LOCK_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed.tabId === 'string' && typeof parsed.timestamp === 'number') {
			return parsed as LeaderLock;
		}
		return null;
	} catch {
		return null;
	}
}

export function writeLock(lock: LeaderLock): void {
	localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
}

export function clearLock(tabId: string): void {
	const current = readLock();
	if (current && current.tabId === tabId) {
		localStorage.removeItem(LOCK_KEY);
	}
}

export function isLockValid(lock: LeaderLock | null, timeout: number): boolean {
	if (!lock) return false;
	return Date.now() - lock.timestamp < timeout;
}

/**
 * Try to acquire the lock. Returns true if this tab now owns the lock.
 * Handles TOCTOU by writing optimistically and re-reading to confirm.
 */
export function tryAcquireLock(tabId: string, timeout: number): boolean {
	const existing = readLock();
	if (existing && isLockValid(existing, timeout) && existing.tabId !== tabId) {
		return false;
	}

	const lock: LeaderLock = { tabId, timestamp: Date.now() };
	writeLock(lock);

	// Re-read to handle TOCTOU race with other tabs
	const confirmed = readLock();
	return confirmed !== null && confirmed.tabId === tabId;
}

export function refreshLock(tabId: string): boolean {
	const current = readLock();
	if (!current || current.tabId !== tabId) {
		return false;
	}
	writeLock({ tabId, timestamp: Date.now() });
	return true;
}
