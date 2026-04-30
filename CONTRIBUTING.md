# Contributing

Thanks for your interest in contributing to this project. The notes below cover the conventions you need to follow.

## Commit messages

This repository uses [Conventional Commits](https://www.conventionalcommits.org/). Each commit message must follow this format:

```
<type>(<optional scope>): <subject>

<optional body>

<optional footer>
```

Messages are validated locally on every commit by a [husky](https://typicode.github.io/husky) `commit-msg` hook running [commitlint](https://commitlint.js.org/), and again in CI on every pull request. Commits that do not conform will be rejected.

### Allowed types

| Type       | Use for                                                       |
| ---------- | ------------------------------------------------------------- |
| `feat`     | A new feature                                                 |
| `fix`      | A bug fix                                                     |
| `chore`    | Maintenance work that doesn't change source or tests          |
| `docs`     | Documentation-only changes                                    |
| `refactor` | Code change that neither fixes a bug nor adds a feature       |
| `test`     | Adding or updating tests                                      |
| `build`    | Build system or dependency changes                            |
| `ci`       | CI configuration changes                                      |
| `perf`     | Performance improvements                                      |
| `style`    | Formatting, whitespace, semicolons (no code logic changes)    |
| `revert`   | Reverts a previous commit                                     |

### Examples

```
feat(web): add wallet connect button to navbar
fix(contracts): correct ENS resolver address on sepolia
docs: explain how to run a local fork
chore(deps): bump viem to 2.47.6
refactor(contracts): extract greeting validation into helper
```

The header must be 100 characters or fewer. Use the body for additional context if needed.

### Setup

The hook is installed automatically when you run `pnpm install` (via the `prepare` script). If you previously ran `pnpm install` without husky present, run it again to register the hook.
