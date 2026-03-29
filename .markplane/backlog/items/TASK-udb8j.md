---
id: TASK-udb8j
title: Create account:import script with password encryption
status: draft
priority: medium
type: feature
effort: small
epic: EPIC-epzv6
plan: null
depends_on:
- TASK-fqpzj
blocks: []
related: []
assignee: null
tags:
- contracts
position: aP
created: 2026-03-28
updated: 2026-03-28
---

# Create account:import script with password encryption

## Description

Create a CLI script that imports an existing private key with password encryption. This allows developers to use their existing deployer accounts securely without storing raw private keys in environment files.

Use @inquirer/password for secure password input in CLI.

## Acceptance Criteria

- [ ] `pnpm contracts:account:import` command works
- [ ] Prompts for private key (hidden input)
- [ ] Prompts for encryption password
- [ ] Stores encrypted key in secure location
- [ ] Displays derived address for verification

## Notes

- Never log or display the raw private key
- Use strong encryption (AES-256 or similar)
- Consider storing in .secrets file or Hardhat keystore

## References
