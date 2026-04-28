# dev

[Zellij](https://zellij.dev/) layouts for the three supported development modes. Each layout describes a tab of panes that run the relevant `pnpm` watchers in parallel; the launching pnpm script wraps them with `zellij-launcher` so reconnecting to an existing session "just works".

| File | Launched by | Purpose |
| --- | --- | --- |
| [`zellij.kdl`](./zellij.kdl) | `pnpm start` (alias of `pnpm zellij`) | Full local dev: local Hardhat node, purgatory, faucet, contract compile/deploy/typescript watchers, web dev server, svelte-check. |
| [`zellij-attach.kdl`](./zellij-attach.kdl) | `pnpm attach <mode>` | Frontend-only: web dev server + svelte-check. Run after `pnpm contracts:export <mode>` has populated `web/src/lib/deployments.ts`. |
| [`zellij-remote-chain.kdl`](./zellij-remote-chain.kdl) | `pnpm remote-chain <mode>` | Develop against a remote chain: web watchers plus contract compile/deploy/typescript watchers, but no local node. |

## How the launchers work

The root `package.json` defines:

- `zellij` — `zellij-launcher a $npm_package_name || zellij -n dev/zellij.kdl -s $npm_package_name`
- `zellij-attach` — same idea using `dev/zellij-attach.kdl` and a `<name>-attach-<mode>` session.
- `zellij-remote-chain` — uses `dev/zellij-remote-chain.kdl` and a `<name>-remote-chain-<mode>` session.

`zellij-launcher a` attaches to an existing session if one is running; otherwise the `||` falls through to `zellij -n` which spawns a fresh layout. `pnpm stop` runs `zellij kill-session $npm_package_name` to tear the main session down.

## Editing layouts

The KDL files describe pane trees with `command` / `args` for each pane — see the [Zellij layout docs](https://zellij.dev/documentation/layouts) for syntax. Keep commands routed through `pnpm` so they stay aligned with the workspace scripts; don't bake absolute paths into panes.
