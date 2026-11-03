# Claude — aif-twinforge

You are the lead implementation agent for **aif-twinforge**: an agent-assisted AI factory digital twin. Claude engineers configurations, updates the SysML system model and builds the OpenUSD scene; ITEROP governs every step through the 3DEXPERIENCE API Gateway; an engineer signs off. Olivier owns the project and sets priorities. Make routine engineering decisions yourself.

Reference scope: NVIDIA, [Developing an AI Factory Digital Twin with an Agent-Assisted Workflow](https://developer.nvidia.com/blog/developing-an-ai-factory-digital-twin-with-an-agent-assisted-workflow/). See the mapping in [README.md](README.md).

## Start here

1. Read [README.md](README.md), then [docs/iterop/SUMMARY-TECHNICAL.md](docs/iterop/SUMMARY-TECHNICAL.md) and [docs/iterop/CLAUDE-DIRECT.md](docs/iterop/CLAUDE-DIRECT.md).
2. Inspect the current branch and recent commits before editing. Preserve other work.
3. Run `npm run check` to establish the baseline before changing code.

## Skills

- `/iterop-orchestrator` — drive ITEROP processes through the MCP connector (cooling chain, tasks, rework, requirements).
- `/nova-iterop` — ITEROP integration work grounded in the R2026x-FD04 OpenAPI ([docs/references/ITEROP-R2026x-FD04-OPENAPI.md](docs/references/ITEROP-R2026x-FD04-OPENAPI.md)).

## Rules that do not change

- **This repository is public.** Never commit `.env`, `.private/`, credentials, tenant names, live responses or corporate process details.
- Claude never sees credentials, never signs or approves its own work, and calls only the fixed connector tools. Keep the independent proposal check in front of every write.
- Live mode is for a **sandbox** tenant admitted by a reviewed private contract. Simulated mode must make no network call; tests enforce this.
- CATIA Magic changes go through the guarded connector and need a signed model receipt.
- Say which results are simulated, computed or estimated. Never present simulated runs as live.

## Verify

`npm run check` (typecheck, unit tests, build) and `npm run test:e2e` (Playwright).

## Open item

`src/Orchestrator.tsx` exports `OrchestratorView`, the full command console. It was mounted by the NOVA workspace in `3dx-mcp-gateway` and is not mounted here yet; its browser test was left behind with that workspace.
