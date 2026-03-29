---
id: TASK-bzr2b
title: Fix mobile wallet extension messaging
status: done
priority: medium
type: bug
effort: small
epic: EPIC-7jrfm
plan: null
depends_on: []
blocks: []
related: []
assignee: null
tags:
- ui
- mobile
- wallets
position: aD
created: 2026-03-27
updated: 2026-03-27
---

# Fix mobile wallet extension messaging

## Description

On mobile devices without an injected provider, the app displays "No Wallet Detected" and shows "Download a Wallet" with the description "Install a browser extension". This messaging is confusing on mobile where browser extensions don't exist.

## Steps to Reproduce

1. Open the app on a mobile device (not in a wallet browser)
2. Attempt to connect
3. Observe the wallet selection modal

## Expected Behavior

On mobile:
- Should NOT mention "browser extension"
- Should emphasize mobile wallet options first
- Primary action should be "Open in Wallet App" or similar
- "Download a Wallet" should mention mobile app stores

## Actual Behavior

Shows "Download a Wallet" with "Install a browser extension" which is desktop-specific and confusing for mobile users.

## Notes

The code in NoWalletFlow.svelte already detects `isMobile` and conditionally shows the "Open in Wallet App" option, but:
1. The title still says "No Wallet Detected" 
2. "Download a Wallet" still appears first with desktop-centric copy
3. The description mentions "browser extension" regardless of platform

**Suggested Fix:**
- When `isMobile` is true, reorder options to show mobile-first
- Change copy to "Get a Mobile Wallet" with "Install from App Store/Play Store"
- Consider hiding the browser extension option entirely on mobile

## References

- [[web/src/lib/core/connection/NoWalletFlow.svelte]] - Mobile detection and wallet options
