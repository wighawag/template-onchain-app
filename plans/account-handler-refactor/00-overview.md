# Account Handler Refactoring - Overview

## Goal

Refactor `createSyncableStore` to use per-account handlers, eliminating shared mutable state and race conditions when switching accounts.

## Problem Summary

Currently, status objects (`mutableSyncStatus`, `mutableStorageStatus`) are global singletons. When async operations complete after an account switch, errors and status are incorrectly attributed to the new account.

## Solution

Each account gets its own isolated `AccountHandler` with independent state, status, and operations.

## Implementation Order

| Phase | Document | Description | Depends On |
|-------|----------|-------------|------------|
| 1 | [01-account-handler-types.md](./01-account-handler-types.md) | Define types and interfaces | - |
| 2 | [02-account-handler-impl.md](./02-account-handler-impl.md) | Implement `createAccountHandler` | Phase 1 |
| 3 | [03-store-refactoring.md](./03-store-refactoring.md) | Refactor store to use handlers | Phase 2 |
| 4 | [04-event-forwarding.md](./04-event-forwarding.md) | Wire up event forwarding | Phase 3 |
| 5 | [05-tests.md](./05-tests.md) | Write comprehensive tests | Phase 4 |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  SyncableStore                                                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Handler Registry: Map<account, AccountHandler>          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  currentAccount: `0x${string}` | undefined                       │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │  Handler 0xA    │  │  Handler 0xB    │                       │
│  │  ┌───────────┐  │  │  ┌───────────┐  │                       │
│  │  │ status    │  │  │  │ status    │  │                       │
│  │  │ emitter   │  │  │  │ emitter   │  │                       │
│  │  │ storage   │  │  │  │ storage   │  │                       │
│  │  │ sync      │  │  │  │ sync      │  │                       │
│  │  └───────────┘  │  │  └───────────┘  │                       │
│  └─────────────────┘  └─────────────────┘                       │
│         │                                                        │
│         ▼ (if current)                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Store Event Emitter (forwards current handler events)   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Public API:                                                     │
│  - getHandler() → current handler                                │
│  - getHandlerFor(account) → specific handler                     │
│  - syncStatusStore → current handler's status                    │
│  - storageStatusStore → current handler's status                 │
│  - subscribe() → state changes                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Decisions

1. **Handler caching**: Keep all handlers until page reload (simplest)
2. **Background mutations**: Allow with optional warning
3. **Event forwarding**: Only current handler's events reach main store
4. **Global listeners**: Stay at store level, signal handlers

## Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `web/src/lib/core/sync/accountHandler.ts` | Create | 2 |
| `web/src/lib/core/sync/types.ts` | Modify (add types) | 1 |
| `web/src/lib/core/sync/createSyncableStore.ts` | Refactor | 3 |
| `web/test/lib/core/sync/accountHandler.test.ts` | Create | 5 |
| `web/test/lib/core/sync/accountSwitching.test.ts` | Create | 5 |

## Success Criteria

1. ✅ Switching accounts shows correct status for new account
2. ✅ Errors from old account don't appear on new account
3. ✅ Background operations complete without affecting current account
4. ✅ Async application code can use captured handler safely
5. ✅ All existing functionality preserved
6. ✅ Tests pass for account switching scenarios
