#!/usr/bin/env sh
# Configures the local clone to use the repo-tracked .githooks/ directory
# and the shared .gitmessage commit template.
#
# Designed to be safe for `pnpm install` in any environment:
#   - silently skips when the working tree isn't a git repo (e.g. tarball install,
#     CI without history, npm registry consumer)
#   - skips when /usr/bin/git isn't available

set -eu

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

git config core.hooksPath .githooks
git config commit.template .gitmessage
