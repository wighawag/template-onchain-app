---
id: EPIC-n3un6
title: Blockchain-Synced Clock Store
status: later
priority: low
started: null
target: null
related: []
tags: []
created: 2026-03-27
updated: 2026-03-27
---

# Blockchain-Synced Clock Store

## Objective

Provide a reactive clock store that starts with local time but synchronizes with blockchain block timestamps. This enables time-sensitive services to operate with accurate blockchain time rather than potentially incorrect user device clocks.

## Key Results

- [ ] Clock store exposes reactive `timestamp` and `synced` state
- [ ] Services can check sync status before proceeding with time-sensitive operations
- [ ] Services can request sync on demand via `requestSync()` API
- [ ] Clock updates to reflect latest block timestamp when synced

## Notes

Replaces investigation task [[TASK-44hrm]].

Use cases:
- Transaction deadlines that depend on blockchain time
- Time-sensitive smart contract interactions
- Preventing issues from user devices with incorrect clock settings
