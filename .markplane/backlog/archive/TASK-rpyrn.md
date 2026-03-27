---
id: TASK-rpyrn
title: Review and customize your markplane setup
status: done
priority: medium
type: chore
effort: small
epic: null
plan: null
depends_on: []
blocks: []
related: []
assignee: null
tags:
- onboarding
position: a0
created: 2026-03-27
updated: 2026-03-27
---

## Description

Walk through the markplane configuration and customize it for your project.

## Steps

1. **Review config.yaml** — Open `.markplane/config.yaml` and update the project name and description. Check that the task types, note types, and workflow statuses fit your team's process.

2. **Customize templates** — Browse `.markplane/templates/` and edit the markdown templates to match your preferred format. Templates use `{TITLE}` placeholders.

3. **Set up AI integration** — If you use Claude Code or another AI tool, run `markplane claude-md` to generate the integration snippet for your `CLAUDE.md`.

4. **Configure documentation paths** — Add `documentation_paths` to `config.yaml` to link your project's existing docs (e.g., `docs/`, `README.md`) into the markplane index.

## Acceptance Criteria

- [ ] Config reflects actual project name and workflow
- [ ] Templates customized or defaults confirmed
- [ ] AI integration configured (if applicable)
