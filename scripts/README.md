# scripts

Repo-level shell scripts that wrap multi-package workflows. They are not on the standard `pnpm` path — invoke them directly.

## `run-e2e-tests.sh`

End-to-end test driver that wires up a local Ethereum node, deploys the contracts, builds the web app, and runs the Playwright suite. Useful for reproducing CI locally and as a single command for agents that want full e2e coverage.

### What it does

1. Checks whether a node is already responding on `http://localhost:8545`.
   - If yes, reuses it.
   - If no, starts `pnpm run node:local` from `contracts/` in the background and waits up to 30s for it to accept JSON-RPC requests.
2. `pnpm compile` in `contracts/`.
3. `pnpm run deploy localhost --skip-prompts` in `contracts/`.
4. `pnpm export localhost --ts ../web/src/lib/deployments.ts` to refresh the web's deployments.
5. `pnpm build localhost` in `web/`.
6. `pnpm exec playwright test` in `web/`.

A trap on `EXIT` shuts down the Hardhat node it started and frees port 4173 (the Playwright preview port). An already-running node owned by something else is left alone.

### Prerequisites

- `pnpm i` already run from the repo root.
- Free ports `8545` (or an existing node) and `4173`.
- `curl`, `lsof`, `bash` available.

### Usage

```bash
./scripts/run-e2e-tests.sh
```

The script is `set -e`, so any step failing aborts the rest.

### Environment

The script does not require special env vars for the localhost path. If you want to deploy to a different network, run the steps manually — this script intentionally pins everything to `localhost` for reproducible e2e.
