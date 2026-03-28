---
id: TASK-utqc3
title: Create offline indicator banner component
status: done
priority: medium
type: feature
effort: xs
epic: EPIC-2h3e9
plan: null
depends_on:
- TASK-jpssi
blocks: []
related: []
assignee: null
tags:
- offline
- ui
position: aH
created: 2026-03-27
updated: 2026-03-27
---

# Create offline indicator banner component

## Description

Create a simple persistent banner that displays when the user is offline (no internet connectivity). The banner is purely informational - it does not change app behavior.

**Key Requirements:**
- Simple banner with clear "You are offline" messaging
- Non-blocking - does not prevent app usage
- Appears when offline store [[TASK-jpssi]] reports offline state
- Disappears when connectivity is restored

**Note:** This is separate from the RPC health banner [[TASK-g7bgk]]. Both banners may need to coexist with appropriate visual hierarchy.

## Acceptance Criteria

- [ ] Banner appears when offline store reports offline=true
- [ ] Banner disappears when connectivity is restored
- [ ] Banner is styled consistently with existing notification/alert components
- [ ] Banner does not block any UI interactions
- [ ] Banner works alongside RPC health banner without visual conflicts

## Notes

Replaced investigation task [[TASK-jit8t]].
Depends on [[TASK-jpssi]] - offline detection store.

## References

- [[web/src/lib/shadcn/ui/alert/]] - Existing alert components for styling reference
