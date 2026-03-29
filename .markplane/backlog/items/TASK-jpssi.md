---
id: TASK-jpssi
title: Create offline detection store using navigator.onLine and fetch heartbeat
status: done
priority: medium
type: feature
effort: small
epic: EPIC-2h3e9
plan: null
depends_on: []
blocks:
- TASK-utqc3
related: []
assignee: null
tags:
- offline
- network
- store
position: aG
created: 2026-03-27
updated: 2026-03-27
---

# Create offline detection store using navigator.onLine and fetch heartbeat

## Description

Create a reactive store that detects when the user has no internet connectivity. This store will be consumed by the offline banner component and can be used by other services that need to know network status.

**Key Requirements:**
- Use `navigator.onLine` as primary detection mechanism with online/offline event listeners
- Consider optional fetch heartbeat as secondary verification (navigator.onLine can have false positives)
- Expose reactive `offline: boolean` state for component consumption
- Store should be importable by any service that needs network status awareness

**Note:** This is distinct from RPC health [[TASK-px9fh]] - offline means no internet at all, while RPC issues mean the specific endpoint is unreachable but internet may work.

## Acceptance Criteria

- [ ] Reactive store exposes `offline: boolean` state
- [ ] Store listens to browser online/offline events
- [ ] Store updates in real-time when connectivity changes
- [ ] Store is easily importable by other services/components
- [ ] Edge case handling for browser API quirks documented

## Notes

Replaced investigation task [[TASK-jit8t]].
Related to [[TASK-px9fh]] - RPC health store (different concerns: offline vs RPC-specific issues).

## References

- MDN navigator.onLine: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- [[web/src/lib/core/service-worker/index.ts]] - Existing service worker infrastructure
