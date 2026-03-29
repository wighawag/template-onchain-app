---
id: TASK-fqpzj
title: Investigate hardhat secrets store API for encrypted key storage
status: draft
priority: medium
type: research
effort: small
epic: EPIC-epzv6
plan: null
depends_on: []
blocks:
  - TASK-mp7dc
  - TASK-udb8j
related: []
assignee: null
tags:
  - investigation
  - contracts
position: aN
created: 2026-03-28
updated: 2026-03-28
---

# Investigate hardhat secrets store API for encrypted key storage

## Description

Determine the best approach for securely storing deployer private keys. Options:

1. **Hardhat v3 configVariable**: Uses `npx hardhat keystore set` to encrypt secrets
2. **Custom encryption**: Encrypt PK with user password, store in .env or separate file
3. **OS keychain**: Use native keyring (macOS Keychain, Windows Credential Manager)

We need to see if Hardhat v3's built-in secrets management is sufficient or if we need custom tooling.

## Acceptance Criteria

- [ ] Hardhat v3 configVariable API tested and documented
- [ ] Decision made on approach: native vs custom
- [ ] Security implications documented
- [ ] Migration path from plain .env mnemonics outlined

## Notes

- Hardhat v3 docs: https://hardhat.org/hardhat-runner/docs/config
- we already support hardhat keystore via setting the value to be "SECRET" in .env, like MNEMONIC_sepolia=SECRET

## References
