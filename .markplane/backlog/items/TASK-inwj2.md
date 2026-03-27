---
id: TASK-inwj2
title: Add missing wallet icons to connection flow
status: draft
priority: low
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
- wallets
- icons
position: a1
created: 2026-03-27
updated: 2026-03-27
---

# Add missing wallet icons to connection flow

## Description

In the wallet selection flow, some wallets display only their first letter instead of their brand icon. This reduces visual recognition and trust. Add proper icons for all supported wallets.

Currently only MetaMask has an icon configured. Other wallets (Rainbow, Rabby, Coinbase Wallet, Trust Wallet) show a fallback letter.

## Acceptance Criteria

- [ ] All wallets in downloadWallets list have icons
- [ ] All wallets in mobileWallets list have icons
- [ ] Icons are properly sized and consistent
- [ ] Icons are stored in appropriate static assets directory
- [ ] Icons have correct licensing/attribution if required

## Notes

**Current State in NoWalletFlow.svelte:**
- MetaMask: `/wallets/metamask/MetaMask-icon-fox.svg` ✓
- Rainbow: `undefined` (shows "R")
- Rabby: `undefined` (shows "R")
- Coinbase Wallet: `undefined` (shows "C")
- Trust Wallet: `undefined` (shows "T")

**Icon Sources:**
- Rainbow: https://rainbow.me/media-kit
- Rabby: https://rabby.io/
- Coinbase: https://www.coinbase.com/press
- Trust Wallet: https://trustwallet.com/press

## References

- [[web/src/lib/core/connection/NoWalletFlow.svelte]] - Wallet lists with icon paths
