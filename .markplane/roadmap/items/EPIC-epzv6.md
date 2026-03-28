---
id: EPIC-epzv6
title: Deployer Account Management Scripts
status: later
priority: medium
started: null
target: null
related: []
tags: []
created: 2026-03-28
updated: 2026-03-28
---

# Deployer Account Management Scripts

## Objective

Provide CLI scripts for managing deployer accounts with secure encrypted storage, improving key management over plain mnemonics in .env files. Makes it easier for new developers to get started and safer for production deployments.

## Key Results

- [ ] `pnpm contracts:account:generate` creates new deployer keypair
- [ ] `pnpm contracts:account:import` imports existing PK with password encryption
- [ ] `pnpm contracts:account` displays deployer address with QR code for mobile funding

## Notes

- can be using @inquirer/password and qrcode
- May leverage Hardhat v3 configVariable or custom encryption
- QR code useful for funding testnet accounts from mobile wallets
