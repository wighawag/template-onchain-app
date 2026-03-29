---
id: EPIC-ed4m9
title: IntegerInput Component with BigInt Support
status: later
priority: medium
started: null
target: null
related: []
tags: []
created: 2026-03-28
updated: 2026-03-28
---

# IntegerInput Component with BigInt Support

## Objective

Create an IntegerInput Svelte component that safely handles bigint values with unit conversion toggles (wei/gwei/ether). This prevents common issues with scientific notation and number precision when dealing with large blockchain integers.

## Key Results

- [ ] IntegerInput.svelte component with native bigint support
- [ ] Unit conversion toggle between wei, gwei, and ether
- [ ] Prevents scientific notation display and precision loss

## Notes

- JavaScript Number type loses precision above 2^53, bigint required
- Useful for contract debug UI with uint256 parameters
