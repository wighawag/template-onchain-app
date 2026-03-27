---
id: EPIC-7jrfm
title: Wallet Connection UX Improvements
status: later
priority: medium
started: null
target: null
related: []
tags: []
created: 2026-03-27
updated: 2026-03-27
---

# Wallet Connection UX Improvements

## Objective

Improve the wallet connection experience for all users, especially on mobile. Users should see appropriate messaging based on their platform, have access to faucet links for testnets, and see proper wallet icons for brand recognition.

## Key Results

- [ ] KR1: Mobile users see mobile-appropriate guidance (not "Install browser extension")
- [ ] KR2: All wallets in connection flow display their brand icons
- [ ] KR3: Testnet users can easily access faucet links to get test tokens

## Scope

**Implementation Tasks:**
- Fix mobile wallet extension messaging
- Add missing wallet icons
- Add faucet link for testnet chains

## Notes

The NoWalletFlow component already has mobile detection logic, but the messaging still mentions "Install a browser extension" which is confusing on mobile devices. This should show mobile-appropriate options instead.
