# Session 4 — 2026-04-26 (Task 4.8)

## Goal
Docker Compose Validation — create `docker-compose.yml`, `Dockerfile.core`, `Dockerfile.web-ui`, and a CI-Linux-gated smoke test.

## Session Type
FOCUSED_IMPL

## Approach
Read the session plan, health controller (confirmed `/healthz` not `/health`), vite.config.ts (confirmed port 4142 not 5173), research notes (confirmed Langfuse + Postgres for observability profile, LGTM stack as separate alternative). Created all four files from scratch. Validated YAML with both `docker compose config` (Docker Desktop available on dev machine) and `js-yaml` parse.

## Accomplished
- Subtask 1: `docker-compose.yml` — three profiles (default/observability/full), env-var-driven credentials, pinned image versions (node:20-slim, postgres:16-alpine, langfuse/langfuse:3)
- Subtask 2: `Dockerfile.core` — multi-stage (deps/build/runner), node:20-slim, pnpm, nest build, EXPOSE 4141, HEALTHCHECK on /healthz
- Subtask 3: `Dockerfile.web-ui` — multi-stage, node:20-slim, vite build + preview on port 4142
- Subtask 4: `packages/core/src/__e2e__/docker-smoke.integration.spec.ts` — CI-Linux-gated, describe.skip on non-Linux, ENOENT guard for missing docker binary, excluded from default `pnpm test`

## Deviations from Plan
- Web-UI port: plan said 5173; actual vite.config.ts uses 4142 (strictPort: true). Used 4142.
- Health path: plan said `/health`; actual HealthController uses `/healthz`. Used `/healthz`.
- `docker compose config --profiles default observability full` (plan syntax) is incorrect (no such service 'default'). Actual validation used `docker compose config` (default) and `docker compose --profile observability --profile full config`. Both returned valid YAML.

## Gates Status
- Typecheck: PASS
- Lint: PASS
- Tests: PASS (999/999, 69 suites)
- Invariants: all green (I-1 confirmed no Anthropic SDK imports; I-2 confirmed no stockforge; I-6 no commit; I-14 n/a)
- YAML validation: PASS (docker compose config + js-yaml parse)
- docker-smoke on Windows: PASS (1 skipped, clean)

## Files Modified
- `docker-compose.yml` (created)
- `Dockerfile.core` (created)
- `Dockerfile.web-ui` (created)
- `packages/core/src/__e2e__/docker-smoke.integration.spec.ts` (created)

## Decisions Made
- Port 4142 (not 5173) for web-ui: matches vite.config.ts reality
- `/healthz` (not `/health`): matches HealthController implementation
- Langfuse v3 image (`langfuse/langfuse:3`): pinned to major version per Langfuse self-host docs

## Next Session Pickup
Task 4.9 (Comprehensive README) is next. It should reference the compose profiles from Task 4.8. The `docker compose --profile full up -d` snippet (using port 4142 for web-ui, not 5173) should be reflected accurately.
