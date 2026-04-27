# Session 3 — 2026-04-25

## Goal
Task 1.12: CLI Package — create `packages/cli/` with `orch init`, `orch attach`, `orch start`, `orch stop`, `orch status` commands using commander.

## Session Type
FOCUSED_IMPL

## Approach
The CLI package stub already existed (package.json, tsconfig, vitest.config, empty index.ts). Added runtime dependencies (commander, js-yaml, zod) and `@types/*` devDeps, then implemented all five commands. `orch start` uses Node.js `spawn` with stdio inherit + pidfile write. `orch stop` reads pidfile and sends SIGTERM. `orch status` calls the REST API via a fetch-based http-client with zod response validation. No `@orch/core` runtime dependency — CLI is a pure thin client.

## Accomplished
- Subtask: `packages/cli/src/lib/orch-home.ts` — resolves ORCH_HOME env or ~/.orch
- Subtask: `packages/cli/src/lib/config.ts` — reads config.yaml; env wins for bearerToken
- Subtask: `packages/cli/src/lib/http-client.ts` — fetch wrapper with bearer auth and DaemonNotRunningError
- Subtask: `packages/cli/src/commands/init.ts` — idempotent dir+config creation
- Subtask: `packages/cli/src/commands/attach.ts` — validates profile.yaml, atomic registry write, dedup, --ccs-profile support
- Subtask: `packages/cli/src/commands/start.ts` — spawn node child, write pidfile, propagate exit code
- Subtask: `packages/cli/src/commands/stop.ts` — read pidfile, process.kill(SIGTERM), cleanup
- Subtask: `packages/cli/src/commands/status.ts` — parallel httpGet for projects/sessions/queue, plain text table output
- Subtask: `packages/cli/src/main.ts` — commander wiring for all 5 commands
- Subtask: `packages/cli/src/index.ts` — named exports for programmatic use
- Subtask: `packages/cli/src/index.spec.ts` — 22 vitest tests covering all commands

## Gates Status
- Typecheck: PASS
- Lint: PASS
- Tests: PASS (22/22 CLI new tests)
- Core regression: PASS (580/580)
- Invariants: all green
  - I-1 (@anthropic-ai/sdk): no runtime imports (test description string only)
  - I-2 (stockforge): no hardcoding (test description string only)
  - I-3 (@orch/core runtime dep): zero runtime imports; only appears in error message string

## Files Modified
packages/cli/package.json
packages/cli/tsconfig.json
packages/cli/src/index.ts
packages/cli/src/main.ts
packages/cli/src/index.spec.ts
packages/cli/src/commands/init.ts
packages/cli/src/commands/attach.ts
packages/cli/src/commands/start.ts
packages/cli/src/commands/stop.ts
packages/cli/src/commands/status.ts
packages/cli/src/lib/orch-home.ts
packages/cli/src/lib/config.ts
packages/cli/src/lib/http-client.ts

## Decisions Made
- Used js-yaml (already in workspace lock) instead of `yaml` package to avoid a new dependency
- Used Node.js built-in `fetch` (Node 18+) in http-client instead of adding `node-fetch` — consistent with target platform Node 20+
- Used `spawn` (async) rather than `spawnSync` for `orch start` so pidfile can be written before daemon's exit; child inherits stdio per Phase 1 spec
- exactOptionalPropertyTypes compliance: used conditional assignment for optional `bearerToken` field

## Next Session Pickup
Task 1.13: App Wiring + Bootstrap — `app.module.ts` imports all feature modules; `main.ts` bootstraps with Fastify adapter, Pino, graceful shutdown. `pnpm run dev` should bring the daemon up.
