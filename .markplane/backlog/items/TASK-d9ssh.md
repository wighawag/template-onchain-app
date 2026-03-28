---
id: TASK-d9ssh
title: Integrate TabLeaderService with tx-observer
status: done
priority: medium
type: feature
effort: small
epic: EPIC-xn9hm
plan: null
depends_on:
- TASK-6jc6r
blocks:
- TASK-ci5bv
related: []
assignee: null
tags:
- tab-leader
- phase-2
position: a4
created: 2026-03-27
updated: 2026-03-27
---

# Integrate TabLeaderService with tx-observer

## Description

Modify the tx-observer to check TabLeaderService before processing. Non-leader tabs simply skip `process()` - they don't need to receive events or sync state because AccountData already syncs via localStorage.

**Key simplification**:
- tx-observer updates AccountData
- AccountData writes to localStorage
- Other tabs receive updates via localStorage sync
- No VirtualTxObserver or event broadcasting needed

## Acceptance Criteria

- [ ] tx-observer checks `isLeader` before calling `process()`
- [ ] Non-leader tabs skip processing entirely (no RPC calls)
- [ ] When tab becomes leader, it starts processing immediately
- [ ] When tab loses leadership, it stops processing
- [ ] All tabs see transaction updates via AccountData localStorage sync

## Notes

### Implementation Approach

The simplest approach is to modify the processing loop:

```typescript
// In tx-observer or connector
if (get(tabLeaderService.isLeader)) {
  observer.process();
}
```

Or wrap the observer:

```typescript
function createLeaderAwareObserver(observer: TransactionObserver, tabLeader: TabLeaderService) {
  return {
    ...observer,
    process() {
      if (get(tabLeader.isLeader)) {
        observer.process();
      }
    }
  };
}
```

### What About TxObserverDebugOverlay?

[[`web/src/lib/debug/TxObserverDebugOverlay.svelte`]](web/src/lib/debug/TxObserverDebugOverlay.svelte) shows observer state and only works on leader tab. This is acceptable since it's a debug tool.

## References

- [[TASK-6jc6r]] - Leader election (depends on)
- [[EPIC-xn9hm]] - Simplified architecture (no VirtualTxObserver needed)
