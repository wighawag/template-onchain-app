# Agent Guide

Guidance for AI / coding agents working in this repo. Humans should read [README.md](./README.md) for the project tour; this file complements it with the conventions an automated agent needs to behave correctly.

## Layout

This is a pnpm workspace with two packages:

- [`contracts/`](./contracts/README.md) — Hardhat v3 + hardhat-deploy v2 + rocketh smart contracts.
- [`web/`](./web/README.md) — SvelteKit 5 + Tailwind 4 frontend, built as a static site.

Supporting directories:

- [`dev/`](./dev/README.md) — Zellij layouts used by `pnpm start`, `pnpm attach`, and `pnpm remote-chain`.
- [`scripts/`](./scripts/README.md) — Repo-level shell scripts (e.g. the e2e pipeline).
- `.markplane/` — Markplane project management (tasks, plans, notes). Do not hand-write IDs; use the markplane MCP tools.

## Setup

```bash
pnpm i
```

`preinstall` enforces pnpm — `npm install` / `yarn` will fail. The contracts package's `prepare` hook runs `pnpm compile`, so the first install builds Solidity sources and generates `contracts/generated/`.

## Per-package commands

Run from repo root via the workspace shortcuts in `package.json`:

| Concern | Command |
| --- | --- |
| Format everything | `pnpm format` (or `pnpm format:check`) |
| Compile contracts | `pnpm contracts:compile` |
| Run all contract tests | `pnpm contracts:test` (or `pnpm test`) |
| Lint Solidity | `pnpm contracts:lint` |
| Build full stack | `pnpm build <mode>` |
| Web type check | `pnpm web:check` |
| Web dev server | `pnpm web:dev` |
| Web e2e | `pnpm --filter ./web test:e2e` (or `scripts/run-e2e-tests.sh`) |

When working inside one package, you can also `cd` into it and call its scripts directly — see each package's README.

## Generated files

These are written by tooling and **must not be hand-edited**:

- `contracts/generated/` — produced by `hardhat compile`.
- `contracts/dist/` — produced by `tsc` for package publication.
- `contracts/deployments/<network>/` — written by hardhat-deploy/rocketh during deploys.
- `web/src/lib/deployments.ts` — produced by `rocketh-export`. Regenerate via `pnpm contracts:export <network> --ts ../web/src/lib/deployments.ts`.
- `web/build/` — produced by `pnpm web:build`.
- `web/static/` PWA icons matching `pwag` output (regenerated on `prepare`).

If a change to the frontend appears to require editing `web/src/lib/deployments.ts`, the right answer is almost always to re-deploy and re-export, not to patch the file.

## Hot Contract Replacement (HCR)

`pnpm start` launches a Zellij session that runs, in parallel:

1. A local Ethereum node.
2. `contracts:compile:watch` — recompile on Solidity changes.
3. `contracts:deploy:watch` — redeploy on artifact changes and re-export `deployments.ts`.
4. `contracts:build:watch` — keep `dist/` fresh.
5. `web:dev` and `web:check:watch`.

The end-to-end effect is HMR for contracts: edit a `.sol`, watch the contract redeploy, watch the web app pick up the new ABI/address via Vite HMR. Don't kill individual panes from agent automation — use `pnpm stop` to tear the session down cleanly.

Variants:

- `pnpm attach <mode>` — frontend-only against an already-deployed network.
- `pnpm remote-chain <mode>` — watch+deploy against a remote chain while running the web app locally.

## Environment variables

Use `.env.local` (loaded by `ldenv`) for secrets. Common variables:

- `ETH_NODE_URI_<network>` — RPC endpoint.
- `MNEMONIC_<network>` / `MNEMONIC` — account derivation.
- `ETHERSCAN_API_KEY` — verification.
- `HARDHAT_FORK` — set by `fork:execute` / `fork:deploy` to fork a network.

Use the literal value `SECRET` to defer to Hardhat's keystore (`configVariable('SECRET_<NAME>')`).

## Conventions

- **Package manager**: pnpm only. Don't add npm or yarn lockfiles; don't run `npm install`.
- **Module type**: every `package.json` here uses `"type": "module"`. New TS files should be ESM.
- **Imports across the workspace**: from `web/`, contracts metadata comes through the generated `$lib/deployments` — not by reaching into `../contracts/`.
- **Formatting**: prettier (with the Solidity, Svelte, and Tailwind plugins). Run `pnpm format` before committing. CI / pre-commit may reject unformatted changes.
- **Solidity linting**: `slippy` via `pnpm contracts:lint`. Keep new contracts clean.
- **Tests**: contracts use Hardhat's node test runner with `earl` and forge-style `*.t.sol`. Web uses Vitest (browser provider) + Playwright. Add tests next to the code they cover (`contracts/test/`, `web/test/`, `web/e2e/`).
- **Commits & PRs**: small, focused commits; conventional-ish prefixes (`fix`, `add`, `format`, `docs:`) match the existing log. Open PRs against `main` and let CI run the full pipeline.

## When you're stuck

- Re-run `pnpm i` if `prepare` artifacts look stale.
- `pnpm contracts:compile` regenerates `generated/`; `pnpm contracts:export <network> --ts ../web/src/lib/deployments.ts` regenerates the web's deployments file.
- For e2e debugging, `scripts/run-e2e-tests.sh` mirrors what CI does locally.
