const LOCK_KEY = 'tx-observer-leader-lock';

export type LockData = {
	tabId: string;
	timestamp: number;
};

export function acquireLock(tabId: string): boolean {
	const now = Date.now();
	const existing = readLock();

	if (existing && existing.tabId !== tabId) {
		// Another tab holds the lock — check if it's still alive
		// A lock is considered stale if not refreshed within the timeout
		const STALE_THRESHOLD = 6000; // slightly more than LEADER_TIMEOUT
		if (now - existing.timestamp < STALE_THRESHOLD) {
			return false;
		}
	}

	writeLock({tabId, timestamp: now});
	return true;
}

export function refreshLock(tabId: string): boolean {
	const existing = readLock();
	if (!existing || existing.tabId !== tabId) {
		return false;
	}
	writeLock({tabId, timestamp: Date.now()});
	return true;
}

export function releaseLock(tabId: string): void {
	const existing = readLock();
	if (existing && existing.tabId === tabId) {
		try {
			localStorage.removeItem(LOCK_KEY);
		} catch {
			// Ignore storage errors
		}
	}
}

export function readLock(): LockData | undefined {
	try {
		const raw = localStorage.getItem(LOCK_KEY);
		if (!raw) return undefined;
		return JSON.parse(raw) as LockData;
	} catch {
		return undefined;
	}
}

function writeLock(data: LockData): void {
	try {
		localStorage.setItem(LOCK_KEY, JSON.stringify(data));
	} catch {
		// Ignore storage errors
	}
}
