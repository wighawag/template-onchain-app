---
id: TASK-gxna7
title: Test leader election, handoff, and state synchronization
status: done
priority: medium
type: chore
effort: medium
epic: EPIC-xn9hm
plan: null
depends_on:
- TASK-ci5bv
blocks: []
related: []
assignee: null
tags:
- tab-leader
- phase-4
- testing
position: a7
created: 2026-03-27
updated: 2026-03-27
---

# Test leader election and handoff

## Description

Test the leader election system to ensure reliability. The simplified architecture means testing is focused on:
- Leader election works correctly
- Leadership handoff when leader closes
- Non-leaders don't make RPC calls
- AccountData localStorage sync propagates updates

**Note**: No state synchronization testing needed since AccountData handles sync via localStorage.

## Acceptance Criteria

- [ ] **Unit tests** for TabLeaderService and storage-lock
- [ ] Only 1 tab makes RPC calls (verify via network tab manually)
- [ ] Leadership handoff completes within 5 seconds
- [ ] AccountData updates appear in follower tabs via localStorage sync
- [ ] Fallback works when BroadcastChannel unavailable

## Notes

### Test Scenarios

1. **Single tab** - Works normally, is always leader
2. **Two tabs** - Second tab becomes follower, no RPC calls
3. **Leader closes** - Follower becomes leader within 5s
4. **New tab** - Becomes follower, receives AccountData via localStorage
5. **Refresh leader tab** - Clean handoff and re-election

### Test Files
```
web/src/lib/core/tab-leader/__tests__/TabLeaderService.test.ts
```

### Manual Testing Checklist
1. Open DevTools Network tab on two browser tabs
2. Verify only one tab shows RPC polling activity
3. Submit a transaction on leader tab
4. Verify follower tab sees the update (via AccountData localStorage sync)
5. Close the leader tab
6. Verify the other tab becomes leader and starts polling
7. Check console for any errors during transitions

### TxObserverDebugOverlay
[[`web/src/lib/debug/TxObserverDebugOverlay.svelte`]](web/src/lib/debug/TxObserverDebugOverlay.svelte) only shows data on leader tab. This is acceptable for a debug tool.

## References

- [[TASK-ci5bv]] - AccountData verification (depends on)
- [[EPIC-xn9hm]] - Success metrics definition
