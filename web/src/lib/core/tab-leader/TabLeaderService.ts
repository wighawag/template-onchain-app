import {writable, type Readable} from 'svelte/store';
import type {TabMessage, TabLeaderService} from './types';
import {acquireLock, refreshLock, releaseLock} from './storage-lock';

const CHANNEL_NAME = 'tx-observer-leader';
const HEARTBEAT_INTERVAL = 2000;
const LEADER_TIMEOUT = 5000;
const ELECTION_DEBOUNCE = 100;

export function createTabLeaderService(): TabLeaderService {
	const tabId = crypto.randomUUID();

	let channel: BroadcastChannel | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
	let electionTimer: ReturnType<typeof setTimeout> | undefined;
	let started = false;

	const _isLeader = writable<boolean>(false);
	let $isLeader = false;

	function setLeader(value: boolean) {
		if ($isLeader !== value) {
			$isLeader = value;
			_isLeader.set(value);
		}
	}

	function broadcast(message: TabMessage) {
		channel?.postMessage(message);
	}

	function announceLeadership() {
		broadcast({type: 'LEADER_ANNOUNCE', tabId, timestamp: Date.now()});
	}

	function sendHeartbeat() {
		if (!refreshLock(tabId)) {
			// Lost the lock (e.g., another tab took it while we were paused)
			yieldLeadership();
			return;
		}
		broadcast({type: 'LEADER_HEARTBEAT', tabId, timestamp: Date.now()});
	}

	function startHeartbeat() {
		stopHeartbeat();
		heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
	}

	function stopHeartbeat() {
		if (heartbeatTimer !== undefined) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = undefined;
		}
	}

	function resetTimeout() {
		stopTimeout();
		timeoutTimer = setTimeout(() => {
			// Leader timed out, try to elect ourselves
			startElection();
		}, LEADER_TIMEOUT);
	}

	function stopTimeout() {
		if (timeoutTimer !== undefined) {
			clearTimeout(timeoutTimer);
			timeoutTimer = undefined;
		}
	}

	function stopElectionTimer() {
		if (electionTimer !== undefined) {
			clearTimeout(electionTimer);
			electionTimer = undefined;
		}
	}

	function startElection() {
		stopElectionTimer();
		// Debounce to prevent rapid elections from multiple tabs
		electionTimer = setTimeout(() => {
			if (!started || $isLeader) return;
			claimLeadership();
		}, ELECTION_DEBOUNCE);
	}

	function claimLeadership() {
		const acquired = acquireLock(tabId);
		if (!acquired) {
			// Someone else holds a valid lock, back off
			resetTimeout();
			return;
		}

		setLeader(true);
		stopTimeout();
		stopElectionTimer();
		announceLeadership();
		startHeartbeat();
	}

	function yieldLeadership() {
		setLeader(false);
		releaseLock(tabId);
		stopHeartbeat();
		resetTimeout();
	}

	function handleMessage(event: MessageEvent<TabMessage>) {
		const message = event.data;
		if (message.tabId === tabId) return;

		switch (message.type) {
			case 'LEADER_ANNOUNCE':
			case 'LEADER_HEARTBEAT':
				if ($isLeader) {
					// Resolve conflict: compare timestamp first, then tabId for deterministic tiebreak
					if (message.timestamp > Date.now() - HEARTBEAT_INTERVAL) {
						// Valid message from another leader — use tabId to resolve
						if (tabId > message.tabId) {
							// We win, re-announce
							announceLeadership();
						} else {
							// We lose
							yieldLeadership();
						}
					}
				} else {
					// We're a follower, reset our timeout since leader is alive
					stopElectionTimer();
					resetTimeout();
				}
				break;
		}
	}

	function onBeforeUnload() {
		if ($isLeader) {
			releaseLock(tabId);
		}
	}

	function start() {
		if (started) return;
		started = true;

		if (typeof BroadcastChannel === 'undefined') {
			// Fallback: no BroadcastChannel, always be leader
			setLeader(true);
			return;
		}

		channel = new BroadcastChannel(CHANNEL_NAME);
		channel.onmessage = handleMessage;

		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', onBeforeUnload);
		}

		// Try to acquire lock and become leader
		claimLeadership();
	}

	function stop() {
		if (!started) return;
		started = false;

		stopHeartbeat();
		stopTimeout();
		stopElectionTimer();

		if ($isLeader) {
			releaseLock(tabId);
		}
		setLeader(false);

		if (channel) {
			channel.onmessage = null;
			channel.close();
			channel = undefined;
		}

		if (typeof window !== 'undefined') {
			window.removeEventListener('beforeunload', onBeforeUnload);
		}
	}

	return {
		isLeader: {subscribe: _isLeader.subscribe} as Readable<boolean>,
		start,
		stop,
		claimLeadership,
	};
}
