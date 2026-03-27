---
id: TASK-g7bgk
title: Create RPC health indicator banner with wallet connect suggestion
status: draft
priority: medium
type: feature
effort: small
epic: EPIC-2h3e9
plan: null
depends_on:
- TASK-px9fh
blocks: []
related: []
assignee: null
tags:
- rpc
- ui
- connection
position: aF
created: 2026-03-27
updated: 2026-03-27
---

# Create RPC health indicator banner with wallet connect suggestion

## Description

Create a persistent banner component that displays when the RPC endpoint has connection issues. The banner should be non-blocking (app continues to work with stale data) and provide contextual guidance to users.

**Key Behaviors:**
1. **When RPC is unhealthy + `prioritizeWalletProvider=true` + user NOT connected:**
   - Show banner suggesting user connect their wallet to use wallet's RPC provider
   - Include connect wallet CTA button
   
2. **When RPC is unhealthy + user IS connected via wallet:**
   - RPC comes from wallet provider - different handling may be needed
   
3. **When RPC is unhealthy + `prioritizeWalletProvider=false`:**
   - Simple informational banner about RPC issues

**Context:**
- This complements the offline indicator [[TASK-utqc3]] - they should work together but show different messages
- Depends on RPC health store [[TASK-px9fh]] for health status

## Acceptance Criteria

- [ ] Banner appears when RPC health store reports unhealthy state
- [ ] Banner is persistent (stays visible) until RPC becomes healthy again
- [ ] When `prioritizeWalletProvider=true` and user not connected, banner suggests connecting wallet
- [ ] Banner includes clear CTA (connect wallet button or info link)
- [ ] Banner does not block app usage - user can continue with stale data
- [ ] Banner disappears when RPC connectivity is restored

## Notes

Replaced investigation task [[TASK-92za5]].
Depends on [[TASK-px9fh]] - RPC health status store.

## References

- [[web/src/lib/core/connection/ConnectionFlow.svelte]] - Connection flow reference
