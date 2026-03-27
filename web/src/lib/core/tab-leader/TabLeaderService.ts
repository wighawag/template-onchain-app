import {writable, type Readable} from 'svelte/store';
import type {TabMessage, TabLeaderService} from './types';

const CHANNEL_NAME = 'tx-observer-leader';
const HEARTBEAT_INTERVAL = 2000;
const LEADER_TIMEOUT = 5000;

export function createTabLeaderService(): TabLeaderService {
	const tabId = crypto.randomUUID();

	let channel: BroadcastChannel | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
	let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

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
		if (timeoutTimer !== undefined) {
			clearTimeout(timeoutTimer);
		}
		timeoutTimer = setTimeout(() => {
			// Leader timed out, claim leadership
			claimLeadership();
		}, LEADER_TIMEOUT);
	}

	function stopTimeout() {
		if (timeoutTimer !== undefined) {
			clearTimeout(timeoutTimer);
			timeoutTimer = undefined;
		}
	}

	function claimLeadership() {
		setLeader(true);
		stopTimeout();
		announceLeadership();
		startHeartbeat();
	}

	function handleMessage(event: MessageEvent<TabMessage>) {
		const message = event.data;

		if (message.tabId === tabId) return;

		switch (message.type) {
			case 'LEADER_ANNOUNCE':
				// Another tab claimed leadership
				if ($isLeader) {
					// Resolve conflict: higher tabId wins
					if (tabId > message.tabId) {
						announceLeadership();
					} else {
						setLeader(false);
						stopHeartbeat();
						resetTimeout();
					}
				} else {
					resetTimeout();
				}
				break;
			case 'LEADER_HEARTBEAT':
				if ($isLeader) {
					// Another leader exists, resolve conflict
					if (tabId > message.tabId) {
						announceLeadership();
					} else {
						setLeader(false);
						stopHeartbeat();
						resetTimeout();
					}
				} else {
					resetTimeout();
				}
				break;
		}
	}

	function start() {
		if (typeof BroadcastChannel === 'undefined') {
			// Fallback: if BroadcastChannel not available, always be leader
			setLeader(true);
			return;
		}

		channel = new BroadcastChannel(CHANNEL_NAME);
		channel.onmessage = handleMessage;

		// Claim leadership immediately on start; other tabs will contest if they're already leading
		claimLeadership();
	}

	function stop() {
		stopHeartbeat();
		stopTimeout();
		setLeader(false);

		if (channel) {
			channel.onmessage = null;
			channel.close();
			channel = undefined;
		}
	}

	return {
		isLeader: {subscribe: _isLeader.subscribe} as Readable<boolean>,
		start,
		stop,
	};
}
