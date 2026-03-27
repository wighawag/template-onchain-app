---
id: TASK-dx7a8
title: Create TabLeaderService with BroadcastChannel communication
status: backlog
priority: medium
type: feature
effort: medium
epic: EPIC-xn9hm
plan: null
depends_on: []
blocks:
- TASK-6jc6r
related: []
assignee: null
tags:
- tab-leader
- phase-1
position: a2
created: 2026-03-27
updated: 2026-03-27
---

# Create TabLeaderService with BroadcastChannel communication

## Description

Create the core `TabLeaderService` that manages leader election using BroadcastChannel for coordination. This service determines which tab should run the tx-observer.

**Key insight**: We only need leader election coordination, not data synchronization. AccountData already syncs via localStorage, so non-leader tabs automatically receive updates. Non-leaders simply skip `process()`.

## Acceptance Criteria

- [ ] TabLeaderService exports `isLeader` readable store
- [ ] `start()` and `stop()` methods control the service lifecycle
- [ ] Service broadcasts LEADER_ANNOUNCE, LEADER_HEARTBEAT messages for election
- [ ] Service cleans up BroadcastChannel on stop/tab close
- [ ] Consumers can subscribe to leadership changes

## Notes

### File Location
```
web/src/lib/core/tab-leader/TabLeaderService.ts
```

### Interface Sketch
```typescript
interface TabLeaderService {
  isLeader: Readable<boolean>;
  start(): void;
  stop(): void;
}

type TabMessage =
  | { type: 'LEADER_ANNOUNCE'; tabId: string; timestamp: number }
  | { type: 'LEADER_HEARTBEAT'; tabId: string; timestamp: number };
```

### Design Decisions
- Uses BroadcastChannel for election coordination only (not data sync)
- Channel name: `tx-observer-leader`
- **No INTENT_STATUS or STATE_SYNC needed** - AccountData localStorage sync handles data propagation

## References

- [[EPIC-xn9hm]] - Parent epic with simplified architecture
- [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
