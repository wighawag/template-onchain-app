---
id: TASK-ci5bv
title: Verify AccountData localStorage sync works with leader election
status: done
priority: medium
type: feature
effort: small
epic: EPIC-xn9hm
plan: null
depends_on:
- TASK-d9ssh
blocks:
- TASK-gxna7
related: []
assignee: null
tags:
- tab-leader
- phase-3
position: a6
created: 2026-03-27
updated: 2026-03-27
---

# Verify AccountData localStorage sync works with leader election

## Description

Verify that the existing AccountData localStorage sync works correctly when only the leader tab runs tx-observer. This is mostly a verification task since AccountData already syncs via localStorage.

**Expected behavior**:
1. Leader tab runs tx-observer → updates AccountData → writes to localStorage
2. Follower tabs receive localStorage updates → AccountData updates automatically
3. When leadership changes, new leader loads current AccountData from localStorage and starts processing

## Acceptance Criteria

- [ ] Verify AccountData localStorage sync already handles multi-tab scenario
- [ ] Confirm new leader tab loads persisted transactions from AccountData
- [ ] Verify no duplicate processing when leadership changes
- [ ] Test rapid leadership changes don't cause state corruption
- [ ] Document any edge cases found

## Notes

### Key Insight

The connector may not need significant changes. AccountData already:
- Persists to localStorage
- Syncs across tabs via storage events
- Loads from localStorage on init

The main verification is ensuring this works correctly with the leader election pattern.

### Files to Review
```
web/src/lib/account/connectors.ts  # createTransactionObserverConnector
web/src/lib/account/AccountData.ts # localStorage sync implementation
```

### Potential Edge Cases
- Leader closes while transaction is in-flight
- New leader starts before old leader fully stops
- localStorage sync timing vs leader election timing

## References

- [[TASK-d9ssh]] - tx-observer integration (depends on)
- [[`web/src/lib/account/AccountData.ts`]](web/src/lib/account/AccountData.ts) - AccountData implementation
