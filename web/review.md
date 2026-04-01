1. 27+ TODO/FIXME items across the codebase

Notable: TODO handle redeployment, TODO finality: 12 (hardcoded), TODO define a correct value (operation deletion timeout), array/tuple input parsing returning values "as is".
Recommendation: Triage and resolve or convert to tracked issues.
Global window pollution (web/src/routes/+layout.svelte or context setup)

2.Minimal frontend test coverage

Only tab-leader has tests. No component tests, no integration tests for Web3 flows.
Recommendation: Add Vitest component tests for critical flows (wallet connection, tx submission, balance check modal).
