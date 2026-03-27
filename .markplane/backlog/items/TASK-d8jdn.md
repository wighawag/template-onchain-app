---
id: TASK-d8jdn
title: Add faucet link for testnet chains
status: draft
priority: medium
type: feature
effort: small
epic: EPIC-7jrfm
plan: PLAN-285u3
depends_on: []
blocks: []
related: []
assignee: null
tags:
- ui
- faucet
- testnet
position: aC
created: 2026-03-27
updated: 2026-03-27
---

# Add faucet link for testnet chains

## Description

Add a faucet button that opens our custom faucet link in a popup window. The faucet URL is configurable via `PUBLIC_FAUCET_LINK` environment variable.

Key requirements:
- Link provided via `PUBLIC_FAUCET_LINK` env variable
- If empty/undefined, no faucet button shown anywhere
- Opens in popup window (not new tab)

## Acceptance Criteria

- [ ] Faucet link configurable via `PUBLIC_FAUCET_LINK` env variable
- [ ] No faucet button shown when env var is empty/undefined
- [ ] Faucet button shows in sidebar below balance **only when balance is zero**
- [ ] Faucet button shows in InsufficientFundsModal whenever modal appears
- [ ] Faucet button does NOT appear anywhere else
- [ ] Link opens in popup window (not new tab)

## Notes

**Locations (only these two):**
1. Sidebar (drawer) - below balance display, only when `balance === 0`
2. InsufficientFundsModal - always visible when modal is open

## References

- [[PLAN-285u3]] - Implementation plan
