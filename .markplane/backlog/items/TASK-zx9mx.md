---
id: TASK-zx9mx
title: Display balance loading errors in UI
status: done
priority: medium
type: feature
effort: small
epic: EPIC-2h3e9
plan: null
depends_on: []
blocks: []
related: []
assignee: null
tags:
- ui
- balance
- error-handling
position: aB
created: 2026-03-27
updated: 2026-03-27
---

# Display balance loading errors in UI

## Description

When balance loading fails (e.g., RPC errors), users see no feedback. The balance store already tracks error state in its status store, but this information is not surfaced to the UI.

Users should see a clear indication when their balance cannot be loaded, with information about the last successful fetch time if available.

## Acceptance Criteria

- [ ] Balance area shows error indicator when balance fetch fails
- [ ] Error message is user-friendly (not raw error)
- [ ] Shows last known balance with "stale" indicator if available
- [ ] Shows time since last successful fetch if applicable
- [ ] Provides retry option to manually trigger balance refresh

## Notes

**Existing Infrastructure:**
- [[web/src/lib/core/connection/balance.ts]] - BalanceStore with status store
- `BalanceStatus` includes: `loading`, `error`, `lastSuccessfulFetch`

**UI Considerations:**
- Don't be too alarming for transient errors
- Distinguish between "still loading" vs "failed to load"
- Consider using existing notification system

## References
