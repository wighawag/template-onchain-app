---
id: TASK-px9fh
title: Create RPC health status store with error detection
status: done
priority: medium
type: feature
effort: small
epic: EPIC-2h3e9
plan: null
depends_on: []
blocks:
- TASK-g7bgk
related: []
assignee: null
tags:
- rpc
- connection
- store
position: aE
created: 2026-03-27
updated: 2026-03-27
---

# Create RPC health status store with error detection

## Description

Create a reactive store that tracks the health status of the RPC endpoint. The store should detect various RPC errors (HTTP 4xx/5xx, network errors, timeouts, rate limiting) and expose a health state that other components can consume.

**Key Requirements:**
- Detect RPC errors from existing balance and gas fee fetching operations
- Track error state with appropriate error categorization
- Expose reactive health status for UI consumption
- Allow app to continue functioning with potentially stale data when RPC is unhealthy

**Context:**
- Current code in `balance.ts` and `gasFee.ts` already has error handling but doesn't surface status
- This store enables the health indicator banner [[TASK-g7bgk]] to display RPC issues

## Acceptance Criteria

- [ ] Reactive store exposes `healthy: boolean` and `error: RpcError | null`
- [ ] Store detects HTTP errors, network errors, and timeouts from RPC calls
- [ ] Error state includes categorization (network, timeout, rate-limit, server-error)
- [ ] Store integrates with existing balance/gasFee fetching without breaking current behavior
- [ ] Health status updates in real-time as RPC connectivity changes

## Notes

Replaced investigation task [[TASK-92za5]].

## References

- [[web/src/lib/core/connection/remote.ts]] - RPC client creation
- [[web/src/lib/core/connection/balance.ts]] - Balance fetching with existing error handling
- [[web/src/lib/core/connection/gasFee.ts]] - Gas fee fetching with existing error handling
