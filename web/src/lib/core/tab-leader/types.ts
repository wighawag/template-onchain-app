export type TabMessage =
	| { type: 'LEADER_ANNOUNCE'; tabId: string; timestamp: number }
	| { type: 'LEADER_HEARTBEAT'; tabId: string; timestamp: number }
	| { type: 'LEADER_RESIGN'; tabId: string };

export interface LeaderLock {
	tabId: string;
	timestamp: number;
}
