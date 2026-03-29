---
id: TASK-6jc6r
title: Implement leader election using localStorage lock + heartbeat
status: done
priority: medium
type: feature
effort: medium
epic: EPIC-xn9hm
plan: null
depends_on:
- TASK-dx7a8
blocks:
- TASK-d9ssh
related: []
assignee: null
tags:
- tab-leader
- phase-1
position: a3
created: 2026-03-27
updated: 2026-03-27
---

# Implement leader election using localStorage lock + heartbeat

## Description

Add leader election logic to TabLeaderService using localStorage for persistent locking and heartbeats for liveness detection. Only one tab should be the "leader" at any time; when the leader tab closes or becomes unresponsive, another tab should take over.

The election protocol:
1. Tab opens → tries to acquire localStorage lock
2. If successful → broadcasts LEADER_ANNOUNCE, starts tx-observer
3. If failed → sends FOLLOWER_READY, waits for state sync
4. Leader sends heartbeats every 2s; followers detect timeout after 5s and initiate re-election

## Acceptance Criteria

- [ ] localStorage lock acquired on start, released on stop/unload
- [ ] Leader broadcasts heartbeats every 2 seconds
- [ ] Follower tabs detect leader timeout after 5 seconds and initiate election
- [ ] When leader closes gracefully, another tab takes over within heartbeat timeout
- [ ] Multiple tabs claiming leadership simultaneously resolves deterministically (timestamp + tabId)
- [ ] `claimLeadership()` method for testing/debugging

## Notes

### File Location
```
web/src/lib/core/tab-leader/storage-lock.ts  # localStorage locking utilities
web/src/lib/core/tab-leader/TabLeaderService.ts  # extend with election logic
```

### Configuration
```typescript
const HEARTBEAT_INTERVAL = 2000;  // ms
const LEADER_TIMEOUT = 5000;      // ms
const LOCK_KEY = 'tx-observer-leader-lock';
const ELECTION_DEBOUNCE = 100;    // prevent rapid elections
```

### Edge Cases to Handle
- Race condition in election → use timestamps + tab IDs for deterministic winner
- Leader crashes without cleanup → heartbeat timeout triggers re-election
- Tab refresh → should gracefully release and re-acquire

## References

- [[TASK-dx7a8]] - TabLeaderService foundation (depends on)
- [[EPIC-xn9hm]] - Leader election protocol sequence diagram
