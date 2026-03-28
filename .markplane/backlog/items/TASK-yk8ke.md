---
id: TASK-yk8ke
title: Create account script to display deployer address with QR code
status: draft
priority: low
type: feature
effort: small
epic: EPIC-epzv6
plan: null
depends_on: []
blocks: []
related: []
assignee: null
tags:
- contracts
position: a4
created: 2026-03-28
updated: 2026-03-28
---

# Create account script to display deployer address with QR code

## Description

Create a CLI script that displays the current deployer account address with a terminal QR code. The QR code makes it easy to fund the deployer from a mobile wallet without copy-pasting addresses.

## Acceptance Criteria

- [ ] `pnpm contracts:account` command works
- [ ] Shows deployer address
- [ ] Renders QR code in terminal
- [ ] Optionally shows balance if network is specified

## Notes

- Use qrcode package for terminal QR rendering
- Could show balance on known networks
- Should work even if account is password-protected

## References
