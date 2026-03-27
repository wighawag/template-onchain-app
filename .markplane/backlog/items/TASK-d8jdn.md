---
id: TASK-d8jdn
title: Add faucet link for testnet chains
status: draft
priority: medium
type: feature
effort: small
epic: EPIC-7jrfm
plan: null
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

When users connect to a testnet, they need test tokens to interact with the app. Currently there's no easy way to find the faucet. Add a visible link to the appropriate faucet based on the connected chain.

This is especially important for:
- New users testing the app
- Developers working with testnets
- Anyone who runs out of test ETH

## Acceptance Criteria

- [ ] Faucet link is displayed when connected to a testnet
- [ ] Link points to the correct faucet for the current chain
- [ ] Link is hidden when connected to mainnet
- [ ] Opens in new tab to preserve app state
- [ ] Link is easily discoverable (sidebar, header, or balance area)

## Notes

**Chain-specific Faucets:**
- Sepolia: https://sepoliafaucet.com/ or https://www.alchemy.com/faucets/ethereum-sepolia
- Localhost: N/A (use hardhat funding)

**Placement Options:**
- Near balance display (contextually relevant when balance is low)
- Sidebar network info section
- Inline with "Insufficient funds" errors

## References
