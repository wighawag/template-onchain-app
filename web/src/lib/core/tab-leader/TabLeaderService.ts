import { writable, type Readable } from 'svelte/store';
import type { TabMessage } from './types.js';
import { tryAcquireLock, refreshLock, clearLock, readLock, isLockValid, writeLock } from './storage-lock.js';

const CHANNEL_NAME = 'tx-observer-leader';
const HEARTBEAT_INTERVAL = 2000;
const LEADER_TIMEOUT = 5000;
const ELECTION_DEBOUNCE = 100;

export interface TabLeaderService {
	isLeader: Readable<boolean>;
	start(): void;
	stop(): void;
	claimLeadership(): void;
}

export function createTabLeaderService(): TabLeaderService {
	const tabId = crypto.randomUUID();
	const { subscribe, set } = writable(false);
	let leader = false;

	let channel: BroadcastChannel | null = null;
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let followerCheckTimer: ReturnType<typeof setInterval> | null = null;
	let electionTimeout: ReturnType<typeof setTimeout> | null = null;
	let running = false;
	const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

	function setLeader(value: boolean) {
		if (leader !== value) {
			leader = value;
			set(value);
		}
	}

	function broadcast(msg: TabMessage) {
		try {
			channel?.postMessage(msg);
		} catch {
			// Channel may be closed
		}
	}

	function becomeLeader() {
		if (!running) return;
		const acquired = tryAcquireLock(tabId, LEADER_TIMEOUT);
		if (!acquired) return;

		setLeader(true);
		broadcast({ type: 'LEADER_ANNOUNCE', tabId, timestamp: Date.now() });
		startHeartbeat();
	}

	function stepDown() {
		setLeader(false);
		stopHeartbeat();
	}

	function startHeartbeat() {
		stopHeartbeat();
		heartbeatTimer = setInterval(() => {
			if (!leader || !running) return;
			const refreshed = refreshLock(tabId);
			if (!refreshed) {
				// Lost the lock (another tab took over)
				stepDown();
				startFollowerCheck();
				return;
			}
			broadcast({ type: 'LEADER_HEARTBEAT', tabId, timestamp: Date.now() });
		}, HEARTBEAT_INTERVAL);
	}

	function stopHeartbeat() {
		if (heartbeatTimer !== null) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	function startFollowerCheck() {
		stopFollowerCheck();
		followerCheckTimer = setInterval(() => {
			if (!running || leader) return;
			const lock = readLock();
			if (!isLockValid(lock, LEADER_TIMEOUT)) {
				scheduleElection();
			}
		}, HEARTBEAT_INTERVAL);
	}

	function stopFollowerCheck() {
		if (followerCheckTimer !== null) {
			clearInterval(followerCheckTimer);
			followerCheckTimer = null;
		}
	}

	function scheduleElection() {
		if (electionTimeout !== null) return;
		// Debounce: random delay to reduce contention
		const delay = ELECTION_DEBOUNCE + Math.random() * ELECTION_DEBOUNCE;
		electionTimeout = setTimeout(() => {
			electionTimeout = null;
			if (!running || leader) return;
			becomeLeader();
			if (!leader) {
				// Failed to acquire, keep checking
				startFollowerCheck();
			}
		}, delay);
	}

	function handleMessage(msg: TabMessage) {
		if (!running) return;

		switch (msg.type) {
			case 'LEADER_ANNOUNCE':
				if (msg.tabId !== tabId) {
					if (leader) {
						// Conflict: resolve deterministically — lowest tabId wins
						if (tabId < msg.tabId) {
							// We win, re-assert
							broadcast({ type: 'LEADER_ANNOUNCE', tabId, timestamp: Date.now() });
						} else {
							// We lose
							stepDown();
							startFollowerCheck();
						}
					}
					// Cancel any pending election
					if (electionTimeout !== null) {
						clearTimeout(electionTimeout);
						electionTimeout = null;
					}
				}
				break;

			case 'LEADER_HEARTBEAT':
				if (msg.tabId !== tabId && leader) {
					// Another tab is also leading — resolve conflict
					if (tabId < msg.tabId) {
						broadcast({ type: 'LEADER_ANNOUNCE', tabId, timestamp: Date.now() });
					} else {
						stepDown();
						startFollowerCheck();
					}
				}
				break;

			case 'LEADER_RESIGN':
				if (msg.tabId !== tabId && !leader) {
					scheduleElection();
				}
				break;
		}
	}

	function onBeforeUnload() {
		if (leader) {
			clearLock(tabId);
			broadcast({ type: 'LEADER_RESIGN', tabId });
		}
		cleanup();
	}

	function cleanup() {
		running = false;
		stopHeartbeat();
		stopFollowerCheck();
		if (electionTimeout !== null) {
			clearTimeout(electionTimeout);
			electionTimeout = null;
		}
		if (channel) {
			channel.onmessage = null;
			channel.close();
			channel = null;
		}
		setLeader(false);
	}

	function start() {
		if (running) return;
		running = true;

		if (!hasBroadcastChannel) {
			// Fallback: no coordination possible, every tab is leader
			setLeader(true);
			return;
		}

		channel = new BroadcastChannel(CHANNEL_NAME);
		channel.onmessage = (event: MessageEvent<TabMessage>) => {
			handleMessage(event.data);
		};

		window.addEventListener('beforeunload', onBeforeUnload);

		// Try to become leader immediately
		const acquired = tryAcquireLock(tabId, LEADER_TIMEOUT);
		if (acquired) {
			setLeader(true);
			broadcast({ type: 'LEADER_ANNOUNCE', tabId, timestamp: Date.now() });
			startHeartbeat();
		} else {
			startFollowerCheck();
		}
	}

	function stop() {
		if (!running) return;
		if (leader) {
			clearLock(tabId);
			broadcast({ type: 'LEADER_RESIGN', tabId });
		}
		window.removeEventListener('beforeunload', onBeforeUnload);
		cleanup();
	}

	function claimLeadership() {
		if (!running) return;
		// Force-write our lock regardless of current state
		writeLock({ tabId, timestamp: Date.now() });
		setLeader(true);
		broadcast({ type: 'LEADER_ANNOUNCE', tabId, timestamp: Date.now() });
		startHeartbeat();
		stopFollowerCheck();
	}

	return {
		isLeader: { subscribe },
		start,
		stop,
		claimLeadership,
	};
}
