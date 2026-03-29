---
id: TASK-mp7dc
title: Create account:generate script for new deployer keypair
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
position: aO
created: 2026-03-28
updated: 2026-03-28
---

# Create account:generate script for new deployer keypair

## Description

Create a CLI script that generates a new random deployer keypair and stores it securely. Based on investigation results from TASK-fqpzj, use either Hardhat's configVariable or custom password encryption.

The script should make it easy for new developers to create a deployer account without manually handling private keys.

## Acceptance Criteria

- [ ] `pnpm contracts:account:generate` command works
- [ ] Generates random mnemonic or private key
- [ ] Stores securely (encrypted or via Hardhat keystore)
- [ ] Displays the derived address after generation

## Notes

- Use viem's account utilities for key generation
- Consider also generating a mnemonic for backup
- Should warn if an account already exists

## References
