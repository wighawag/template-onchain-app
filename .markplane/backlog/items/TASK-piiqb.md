---
id: TASK-piiqb
title: Create IntegerInput.svelte component with bigint support and unit conversion
status: draft
priority: medium
type: feature
effort: medium
epic: EPIC-ed4m9
plan: null
depends_on: []
blocks: []
related: []
assignee: null
tags:
- web
position: aQ
created: 2026-03-28
updated: 2026-03-28
---

# Create IntegerInput.svelte component with bigint support and unit conversion

## Description

Create a Svelte component for integer input that safely handles bigint values (uint256) with unit conversion toggles. JavaScript's Number type loses precision above 2^53, so this component must use bigint throughout.

Useful for contract debug UI and any form dealing with token amounts or large numbers.

## Acceptance Criteria

- [ ] IntegerInput.svelte component created
- [ ] Uses bigint internally, no precision loss
- [ ] Unit toggle between wei/gwei/ether
- [ ] Prevents scientific notation in display
- [ ] Validates input is valid integer

## Notes

- Consider using string internally for display, convert to bigint on change
- Handle paste events that might include commas or spaces
- Edge cases: negative numbers (for int256), max uint256

## References
