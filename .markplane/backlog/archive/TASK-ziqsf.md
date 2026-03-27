---
id: TASK-ziqsf
title: Add state serialization and modify createTransactionObserver factory
status: backlog
priority: medium
type: feature
effort: medium
epic: EPIC-xn9hm
plan: null
depends_on: []
blocks: []
related: []
assignee: null
tags:
- tab-leader
- phase-2
position: a5
created: 2026-03-27
updated: 2026-03-27
---

# Add state serialization and modify createTransactionObserver factory

## Description

When leadership changes (new tab opens, leader closes), the new leader needs to receive the current transaction observer state from the previous leader. This requires:

1. **State serialization** - The observer's internal state (pending intents, their current status) must be serializable to JSON for transmission via BroadcastChannel.

2. **Factory modification** - The `createTransactionObserver` factory should return the appropriate observer type based on the TabLeaderService, and handle initialization with serialized state from other tabs.

This enables seamless handoff: when a leader closes, the new leader can immediately continue tracking the same transactions.

## Acceptance Criteria

- [ ] `serializeObserverState()` exports current intents and their statuses as JSON-safe object
- [ ] `deserializeObserverState()` restores observer from serialized state
- [ ] `createTransactionObserver` factory returns LeaderAwareTxObserver or VirtualTxObserver based on context
- [ ] New tabs request state via REQUEST_STATE message
- [ ] Leaders respond with STATE_SYNC containing serialized state
- [ ] State transfer verified: new leader has same pending transactions as old leader

## Notes

### File Locations
```
web/src/lib/core/tab-leader/types.ts           # SerializedObserverState type
web/src/lib/core/tab-leader/index.ts           # createTransactionObserver factory
```

### Serialized State Structure
```typescript
interface SerializedObserverState {
  intents: Record<string, {
    intent: TransactionIntent;
    status: IntentStatus;
    lastChecked: number;
  }>;
  timestamp: number;
}
```

## References

- [[TASK-d9ssh]] - Observer implementations (depends on)
- [[EPIC-xn9hm]] - State synchronization protocol
