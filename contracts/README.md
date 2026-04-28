# Contracts

Smart contract package for the [template-onchain-app](../README.md) monorepo. Built on [Hardhat v3](https://hardhat.org/), [hardhat-deploy v2](https://github.com/wighawag/hardhat-deploy), and the [rocketh](https://github.com/wighawag/rocketh) deployment system, with [viem](https://viem.sh/) as the Ethereum client.

## Layout

```
contracts/
├── src/                # Solidity source, organized by feature
│   └── GreetingsRegistry/
│       ├── GreetingsRegistry.sol      # Contract
│       └── GreetingsRegistry.t.sol    # forge-style Solidity tests
├── deploy/             # Numbered TypeScript deploy scripts (executed in order)
├── deployments/        # Per-network deployment artifacts (committed)
├── generated/          # Auto-generated artifacts and ABIs (do not hand-edit)
│   ├── abis/
│   └── artifacts/
├── rocketh/            # Rocketh setup
│   ├── config.ts       # Named accounts and rocketh extensions
│   ├── deploy.ts       # `deployScript` / `artifacts` exports for deploy/*
│   └── environment.ts  # Environment bootstrap for tests and scripts
├── scripts/            # One-off TypeScript scripts (e.g. setMessage.ts)
├── test/               # TypeScript tests using node:test + earl
├── hardhat.config.ts   # Hardhat v3 configuration
├── slippy.config.js    # Solidity linter configuration
└── dist/               # Compiled package output (for publication)
```

## Toolchain

- **Hardhat v3** with the viem plugin and the keystore plugin for secret management.
- **hardhat-deploy v2** + **rocketh** for declarative, idempotent deployments and proxy upgrades.
- **forge-std** for forge-style Solidity unit tests, executed by Hardhat's node test runner alongside TypeScript tests written with [earl](https://earl.fun/).
- **slippy** for Solidity linting; **prettier** (with `prettier-plugin-solidity`) for formatting.
- **purgatory** as an alternative local node, and **faucet-server** for funding test accounts.

## Scripts

Run from this directory or as `pnpm --filter ./contracts <script>` from the monorepo root.

| Script                         | Description                                                        |
| ------------------------------ | ------------------------------------------------------------------ |
| `compile`                      | Compile Solidity sources via `hardhat compile`.                    |
| `compile:watch`                | Recompile on changes under `src/`.                                 |
| `deploy <network>`             | Run deploy scripts against `<network>`.                            |
| `deploy:dev`                   | Deploy to localhost and export ABIs to the web package.            |
| `deploy:watch`                 | Watch `generated/` and `deploy/`, redeploy on change (powers HCR). |
| `test`                         | Run Solidity + TypeScript tests via `hardhat test`.                |
| `test:watch`                   | Re-run tests when `generated/` or `test/` changes.                 |
| `node:local`                   | Start a local Hardhat node.                                        |
| `node:purgatory`               | Start a purgatory node on port 8545.                               |
| `faucet`                       | Run a local faucet server (no captcha) on port 34010.              |
| `fork:execute` / `fork:deploy` | Run scripts/deploys against a forked network (`HARDHAT_FORK`).     |
| `execute`                      | Run a TypeScript script via `tsx` against `HARDHAT_NETWORK`.       |
| `verify <network>`             | Submit verification metadata via `rocketh-verify`.                 |
| `export <network>`             | Export deployments to a TypeScript file via `rocketh-export`.      |
| `docgen`                       | Generate documentation from deployments via `@rocketh/doc`.        |
| `lint`                         | Run `slippy` over `src/**/*.sol`.                                  |
| `format` / `format:check`      | Run prettier over the package.                                     |
| `start` / `stop`               | Launch / kill the local Zellij session defined in `zellij.kdl`.    |

## Named Accounts

Configured in [`rocketh/config.ts`](./rocketh/config.ts). The defaults are:

- `deployer` — index `0` of the active mnemonic.
- `admin` — index `1`.

Override per-network by extending the `accounts` map.

## Environment Variables

| Variable                 | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `ETH_NODE_URI_<network>` | RPC endpoint used by Hardhat and rocketh.              |
| `MNEMONIC_<network>`     | Network-specific mnemonic for account derivation.      |
| `MNEMONIC`               | Fallback mnemonic when no network-specific one is set. |
| `ETHERSCAN_API_KEY`      | API key used by `verify`.                              |
| `HARDHAT_FORK`           | When set, runs against a fork of the named network.    |

Use `SECRET` as the value of an env var to read it from the Hardhat keystore instead (e.g. `ETH_NODE_URI_mainnet=SECRET` resolves via `configVariable('SECRET_ETH_NODE_URI_mainnet')`).

## Writing Deploy Scripts

Deploy scripts live in `deploy/`, are TypeScript, and run in lexicographic order (so prefix them with numbers, e.g. `001_…`). They consume the helpers exported from [`rocketh/deploy.ts`](./rocketh/deploy.ts):

```typescript
import {deployScript, artifacts} from '../rocketh/deploy.js';

export default deployScript(
	async (env) => {
		const {deployer, admin} = env.namedAccounts;
		await env.deployViaProxy(
			'GreetingsRegistry',
			{
				account: deployer,
				artifact: artifacts.GreetingsRegistry,
				args: ['prefix:'],
			},
			{owner: admin},
		);
	},
	{tags: ['GreetingsRegistry']},
);
```

`deployViaProxy` handles upgradeable deployments using the proxy patterns from `@rocketh/proxy`.

## Tests

```bash
pnpm test
```

Runs both:

- **Solidity tests** (`*.t.sol`) using forge-std assertions.
- **TypeScript tests** (`test/**/*.test.ts`) via the Hardhat node test runner, with [earl](https://earl.fun/) for assertions and helpers in [`test/utils/`](./test/) for environment setup.

## Publication

The package is published with this `exports` map (see [`package.json`](./package.json)):

```json
{
	"./deploy/*": "./dist/deploy/*",
	"./rocketh/*": "./dist/rocketh/*",
	"./artifacts/*": "./dist/generated/artifacts/*",
	"./abis/*": "./dist/generated/abis/*",
	"./deployments/*": "./deployments/*",
	"./src/*": "./src/*"
}
```

The `dist/` directory is produced by `pnpm contracts:build` from the monorepo root, which compiles Solidity, runs `tsc`, and re-exports deployments. The `files` field publishes `dist`, `src`, and `deployments`.

## Hot Contract Replacement (HCR)

When the root `pnpm start` (or `pnpm contracts:start`) is running, `compile:watch` and `deploy:watch` together rebuild and redeploy on Solidity changes, then re-export to `web/src/lib/deployments.ts`. The web dev server picks the new addresses/ABIs up via Vite HMR.
