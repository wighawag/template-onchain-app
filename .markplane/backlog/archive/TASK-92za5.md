---
id: TASK-92za5
title: Investigate RPC connection error handling and recovery flow
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
- rpc
- connection
position: a8
created: 2026-03-27
updated: 2026-03-27
---

# Investigate RPC connection error handling and recovery flow

## Description

Investigate how to detect and handle RPC connection issues in the web app. Currently when the RPC endpoint has HTTP errors (connection refused, timeout, 5xx errors), there's no clear user feedback or recovery mechanism.

**Questions to Answer:**
1. What types of RPC errors can occur? (HTTP 4xx/5xx, network errors, timeouts, rate limiting)
2. How do these manifest in the current `@etherplay/connect` library?
3. Where should error states be surfaced in the UI?
4. Should we prompt the user to retry connection or switch to an alternative RPC?
5. How do balance/gas fee stores handle persistent RPC failures?

**Relevant Code:**
- [[web/src/lib/core/connection/remote.ts]] - RPC client creation
- [[web/src/lib/core/connection/balance.ts]] - Balance fetching with error handling
- [[web/src/lib/core/connection/gasFee.ts]] - Gas fee fetching with error handling

## Acceptance Criteria

- [ ] Document the types of RPC errors that can occur
- [ ] Define a clear error state model for RPC connection
- [ ] Propose UI locations for displaying RPC health status
- [ ] Recommend recovery flow (manual retry, automatic retry, RPC switching)
- [ ] Create follow-up implementation tasks based on findings

## Notes

User stories that prompted this investigation:
- "show rpc http issues when connected to it"
- "asking connect on RPC http issues"

## References

- viem error handling: https://viem.sh/docs/glossary/errors
