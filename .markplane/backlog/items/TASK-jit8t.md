---
id: TASK-jit8t
title: Investigate offline detection strategy and indicator design
status: draft
priority: medium
type: research
effort: medium
epic: EPIC-2h3e9
plan: null
depends_on: []
blocks: []
related: []
assignee: null
tags:
- investigation
- offline
- network-status
position: a9
created: 2026-03-27
updated: 2026-03-27
---

# Investigate offline detection strategy and indicator design

## Description

Investigate how to detect when the user is offline and design an appropriate indicator for the UI. Currently there's no visual feedback when the user loses network connectivity.

**Questions to Answer:**
1. What detection methods are available? (navigator.onLine, Network Information API, fetch-based heartbeat)
2. How reliable is each method? What are the edge cases?
3. Where should the offline indicator be displayed? (toast, banner, sidebar icon)
4. Should the app behave differently when offline? (disable actions, show cached data)
5. How should this integrate with the service worker infrastructure that already exists?

**Considerations:**
- Browser API support varies
- navigator.onLine can give false positives
- RPC endpoint might be down while general internet works
- Should distinguish between "no internet" vs "RPC unreachable"

## Acceptance Criteria

- [ ] Compare offline detection approaches with pros/cons
- [ ] Recommend a detection strategy that handles edge cases
- [ ] Design mockup or specification for offline indicator placement
- [ ] Define offline mode behavior if applicable
- [ ] Create follow-up implementation tasks based on findings

## Notes

User story that prompted this investigation:
- "offline indicator"

Related to [[TASK-92za5]] - RPC error handling investigation

## References

- MDN navigator.onLine: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
- Network Information API: https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
