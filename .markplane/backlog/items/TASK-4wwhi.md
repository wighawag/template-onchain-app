---
id: TASK-4wwhi
title: Implement block timestamp sync mechanism with requestSync API
status: draft
priority: low
type: feature
effort: small
epic: EPIC-n3un6
plan: null
depends_on:
- TASK-5w697
blocks: []
related: []
assignee: null
tags:
- clock
- blockchain
- sync
position: a3
created: 2026-03-27
updated: 2026-03-27
---

# Implement block timestamp sync mechanism with requestSync API

## Description

Implement the mechanism to sync the clock store [[TASK-5w697]] with blockchain block timestamps. Services that need accurate blockchain time can request a sync before proceeding with time-sensitive operations.

**Key Requirements:**
- Fetch latest block from RPC and extract timestamp
- Update clock store with block timestamp
- Set `synced: true` after successful sync
- Provide `requestSync()` function for services to trigger sync on demand
- Handle sync failures gracefully (keep current timestamp, leave synced=false)

**API:**
```typescript
function requestSync(): Promise<boolean>; // Returns true if sync succeeded
```

## Acceptance Criteria

- [ ] `requestSync()` function fetches latest block timestamp from RPC
- [ ] Clock store updates to block timestamp on successful sync
- [ ] `synced` flag is set to `true` after successful sync
- [ ] Sync failures are handled gracefully without crashing
- [ ] Services can await sync completion before proceeding

## Notes

Replaced investigation task [[TASK-44hrm]].
Depends on [[TASK-5w697]] - reactive clock store.
Part of [[EPIC-n3un6]] - Blockchain-Synced Clock Store.

## References
