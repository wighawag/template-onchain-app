# setup

`pnpm i`

# frontend

in ./web
for typescript checks: `pnpm check`
for tests: `pnpm test`

# commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are validated by `.githooks/commit-msg` (wired up automatically by `pnpm install`).

Format: `<type>(<scope>): <subject>`

Allowed types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`. Scope is optional. Use `!` before the colon for breaking changes. See [`.gitmessage`](./.gitmessage) for the full template and the README "Commit Messages" section for examples.
