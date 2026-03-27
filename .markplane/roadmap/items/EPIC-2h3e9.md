---
id: EPIC-2h3e9
title: Connection Health and Network Status Indicators
status: later
priority: medium
started: null
target: null
related: []
tags: []
created: 2026-03-27
updated: 2026-03-27
---

# Connection Health and Network Status Indicators

## Objective

Improve user awareness of connection health and network status. Users should understand when there are RPC issues, when they're offline, current gas prices, and any errors loading their balance. This reduces confusion and enables informed decision-making during connectivity problems.

## Key Results

- [ ] KR1: Users can see RPC connection status and are prompted to reconnect on failures
- [ ] KR2: Offline status is clearly indicated when network connectivity is lost
- [ ] KR3: Gas prices are visible in the sidebar for transaction cost awareness
- [ ] KR4: Balance loading errors are displayed with clear messaging

## Scope

**Investigation Tasks:**
- [[TASK-92za5]] - RPC error handling investigation
- [[TASK-jit8t]] - Offline detection investigation

**Implementation Tasks:**
- Show gas price in sidebar
- Display balance loading errors
- Implement RPC error handling based on investigation findings
- Implement offline indicator based on investigation findings

## Notes

This epic groups together several user requests related to connection health visibility. The investigation tasks should be completed first to inform the implementation approach for RPC errors and offline detection.
