# Contracts

Smart contract package for the onchain app template, built with [Hardhat v3](https://hardhat.org/) and the [rocketh](https://github.com/wighawag/rocketh) deployment system.

## Project Structure

```
contracts/
├── src/                    # Solidity source files (organized by feature)
│   └── GreetingsRegistry/  # Example contract with its Solidity tests
├── deploy/                 # Numbered deployment scripts (TypeScript)
├── deployments/            # Per-network deployment artifacts
├── generated/              # Auto-generated typed artifacts and ABIs
├── rocketh/                # Rocketh configuration
│   ├── config.ts           # Named accounts & extension config
│   ├── deploy.ts           # Deploy script setup
│   └── environment.ts      # Environment setup for tests/scripts
├── test/                   # TypeScript tests
└── hardhat.config.ts       # Hardhat configuration
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)

Install dependencies from the monorepo root:

```bash
pnpm i
```

## Commands

All commands below are run from the `contracts/` directory.

### Compile

```bash
pnpm compile              # Compile Solidity sources
pnpm compile:watch        # Re-compile on file changes
```

### Test

```bash
pnpm test                 # Run Solidity + TypeScript tests
pnpm test:watch           # Re-run tests on file changes
```

Tests include forge-style Solidity tests (using `forge-std`) and TypeScript tests (Node.js test runner with `earl` assertions).

### Deploy

```bash
pnpm deploy <network>                # Deploy to a network
pnpm deploy:dev                      # Deploy to local dev node
pnpm fork:deploy                     # Deploy against a forked network
```

### Verify

```bash
pnpm verify <network>                # Verify contracts on Etherscan
```

### Export

```bash
pnpm export <network>                # Export deployment artifacts (addresses, ABIs)
```

### Lint & Format

```bash
pnpm lint                 # Lint Solidity with slippy
pnpm format               # Format with prettier + prettier-plugin-solidity
pnpm format:check         # Check formatting
```

### Local Node

```bash
pnpm node:local           # Start a local Hardhat node (3s block interval)
pnpm node:purgatory       # Start a purgatory node on port 8545
```

### Documentation

```bash
pnpm docgen               # Generate contract documentation from deployments
```

## Configuration

### Named Accounts

Configure accounts in `rocketh/config.ts`:

```typescript
export const config = {
  accounts: {
    deployer: { default: 0 },
    admin: { default: 1 },
  },
} as const satisfies UserConfig;
```

### Networks

Networks are configured in `hardhat.config.ts` using helpers from `hardhat-deploy`:

- **`addNetworksFromEnv()`** — auto-adds networks from `ETH_NODE_URI_<network>` env vars
- **`addNetworksFromKnownList()`** — adds well-known chain configurations
- **`addForkConfiguration()`** — enables fork mode via the `HARDHAT_FORK` env var

The `default` network uses EDR (simulated) and the `local` network runs with a 3-second mining interval.

### Solidity Compiler

Two profiles are defined in `hardhat.config.ts`:

- **default** — Solidity 0.8.28, no optimizer (faster compilation for development)
- **production** — Solidity 0.8.28, optimizer enabled with 999999 runs

### Environment Variables

| Variable                 | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `ETH_NODE_URI_<network>` | RPC endpoint for the network                         |
| `MNEMONIC_<network>`     | Mnemonic for account derivation on a specific network|
| `MNEMONIC`               | Fallback mnemonic if network-specific one is not set |
| `ETHERSCAN_API_KEY`      | API key for contract verification                    |
| `HARDHAT_FORK`           | Network name to fork from                            |

Set any of these to `SECRET` to use Hardhat's built-in secret store (`configVariable()`).

Environment variables are loaded via [ldenv](https://github.com/nicoth-in/ldenv). Place them in `.env.local` (gitignored).

## Writing Deploy Scripts

Deploy scripts live in `deploy/` and are executed in filename order. Each script uses the `deployScript` helper:

```typescript
import { deployScript, artifacts } from "../rocketh/deploy.js";

export default deployScript(
  async (env) => {
    const { deployer, admin } = env.namedAccounts;

    await env.deployViaProxy(
      "GreetingsRegistry",
      {
        account: deployer,
        artifact: artifacts.GreetingsRegistry,
        args: ["prefix:"],
      },
      { owner: admin },
    );
  },
  { tags: ["GreetingsRegistry"] },
);
```

## Publishing

This package can be published for external consumption. The `exports` field in `package.json` exposes:

- `./deploy/*` — deployment scripts
- `./rocketh/*` — rocketh configuration
- `./artifacts/*` — compiled contract artifacts
- `./abis/*` — contract ABIs
- `./deployments/*` — deployment records per network
- `./src/*` — Solidity source files

Build the TypeScript output before publishing:

```bash
pnpm typescript
```

## Monorepo Integration

This package is part of the [template-onchain-app](../) monorepo. Contract ABIs and deployment addresses are exported to the web frontend via `rocketh-export`, enabling the frontend to interact with deployed contracts. See the root README for full-stack development workflows.
