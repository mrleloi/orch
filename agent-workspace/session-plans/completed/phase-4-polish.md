# Phase 4 — Polish & Share

> **Session type**: FOCUSED_IMPL, DOC, VERIFY
> **Goal**: Orch is installable via npm, scaffolds a new project in under 60 seconds, documented, tested on at least one real project end-to-end.
> **Estimated duration**: 1-2 autonomous days
> **Pre-requisite**: Phase 3 complete

---

## Phase Goal (Success Criteria)

All Charter success criteria met:

- [ ] F1-F8 functional criteria pass (end-to-end)
- [ ] N1-N6 non-functional criteria pass
- [ ] O1-O4 observability criteria pass
- [ ] S1-S4 safety criteria pass

Plus:

- [ ] `npm install -g @<scope>/orch-cli` works from a clean machine
- [ ] `orch init` completes in < 60 seconds
- [ ] `orch attach <path>` scaffolds `.orch/profile.yaml` interactively
- [ ] `README.md` is clear to an outside developer
- [ ] `docs/` has: Quick Start, Configuration Reference, Troubleshooting, Architecture Overview
- [ ] `docker-compose.yml` spins up full stack with one command
- [ ] Example integration (`examples/stockforge-integration/`) is complete + verified
- [ ] CI passes (GitHub Actions): typecheck, lint, test on Node 20 + 22
- [ ] Release: v1.0.0 tagged

---

## Task Breakdown

### Task 4.1: Polish CLI Init Flow (FOCUSED_IMPL)
**Budget**: 80K

Interactive prompts (use `@inquirer/prompts`):
- `orch init`:
  - Create `~/.orch/` dir tree
  - Generate auth token (32-byte hex)
  - Generate Telegram bot setup instructions
  - Ask if user wants to start daemon now
  - Output summary + next steps
- `orch attach <path>`:
  - Detect project root (has `.git`? has `.claude/`?)
  - Interactive profile.yaml creation:
    - Ask: project name (default: folder name)
    - Ask: ccs primary profile
    - Ask: fallback profiles
    - Ask: inject hooks into `.claude/settings.json`?
    - Ask: Telegram notifications for this project?
  - Write `.orch/profile.yaml`
  - Inject hooks if confirmed (with atomic backup of original settings.json)
- `orch detach <path>`:
  - Remove `.orch/profile.yaml`
  - Restore `.claude/settings.json` from backup
  - Unregister from daemon

### Task 4.2: Hook Injection Utility (FOCUSED_IMPL)
**Budget**: 60K

- Read existing `.claude/settings.json`
- Merge Orch hooks in a way that preserves existing hooks
- Backup original to `.claude/settings.json.backup-<timestamp>` before modifying
- Idempotent: running twice doesn't duplicate
- Tests with various starting settings.json states

### Task 4.3: Comprehensive README (DOC)
**Budget**: 50K

Root `README.md`:
- Hero: what Orch is (1 paragraph)
- Why: pain it solves (3 bullets)
- Quick start (5 commands)
- Architecture overview (one diagram)
- Features (bullet list)
- Requirements (Node 20+, ccs, claude CLI)
- Screenshot of Web UI (placeholder)
- Link to docs
- License, contributing, support

Tone: direct, no marketing fluff. Target: a senior dev evaluates in 5 minutes.

### Task 4.4: Configuration Reference (DOC)
**Budget**: 40K

`docs/configuration.md`:
- Every env var with default + description
- `~/.orch/config.yaml` structure
- Profile schema (full reference)
- Hook event schemas (payloads Orch receives)
- API reference (REST + WS events)

### Task 4.5: Troubleshooting Guide (DOC)
**Budget**: 30K

`docs/troubleshooting.md`:
- Daemon won't start (port conflict, permissions)
- Hooks not firing (Claude Code version, settings.json path)
- ccs account switching (quota visibility)
- OTEL traces missing (collector endpoint, env vars)
- Telegram bot silent (token invalid, user not in whitelist)
- SQLite lock errors (WAL mode, concurrency)

### Task 4.6: Architecture Overview (DOC)
**Budget**: 40K

`docs/architecture.md`:
- Mirror constitution/architecture.md but user-facing
- Diagrams (ASCII or mermaid)
- Data flow for a queue item's lifecycle
- Extensibility points (adapters, custom commands)

### Task 4.7: Example Integration Complete (FOCUSED_IMPL)
**Budget**: 60K

`examples/stockforge-integration/`:
- Full `profile.yaml` matching StockForge's actual structure
- `settings.json` snippet with hooks
- `README.md` explaining the 3-step integration with actual commands
- Verify against the stockforge zip (starter kit has stockforge repo zip as reference — read structure, don't copy)

Also add one generic example:
`examples/generic-nodejs-project/` — smaller, simpler profile for any Node project

### Task 4.8: CI Setup (FOCUSED_IMPL)
**Budget**: 40K

`.github/workflows/ci.yml`:
- Matrix: Node 20, 22 on ubuntu-latest
- Steps: install pnpm, install deps, typecheck, lint, test
- Coverage upload to Codecov (optional)

`.github/workflows/release.yml`:
- Triggered by tag `v*`
- Builds all packages, publishes to npm
- Creates GitHub release with changelog

### Task 4.9: Docker Compose Validation (FOCUSED_IMPL)
**Budget**: 40K

`docker-compose.yml` profiles:
- Default: just `orch-core`
- `observability`: adds Langfuse + Postgres
- `full`: core + observability + web-ui exposed

Test: `docker compose up -d` + curl health check.

### Task 4.10: Release Checklist (DOC)
**Budget**: 20K

`docs/release.md`:
- Steps to cut a release
- CHANGELOG format
- Semver rules
- Breaking change policy

### Task 4.11: Final Verification Gate (VERIFY)
**Budget**: 80K

Exhaustive end-to-end:
1. Fresh machine (or fresh Docker container)
2. Install Node + pnpm + Docker
3. Install Orch globally from local pnpm link (simulate npm install)
4. `orch init` + `orch attach <sample project>`
5. Run `orch start`
6. Drop plan file, verify processing
7. Test Telegram (real bot if available)
8. Test Web UI
9. Simulate context-full, verify handoff
10. Simulate budget breach, verify pause
11. Simulate rate limit (mocked), verify graceful handling
12. All 4 Charter criteria sections (F/N/O/S) verified

Any FAIL → fix, re-run.

### Task 4.12: Project Complete (housekeeping)
**Budget**: 20K

- Write `agent-workspace/memory/project-complete.md` summarizing:
  - Phases executed
  - Deliverables shipped
  - Decisions made (index)
  - Known limitations / future work
  - Stats: lines of code, test coverage, tokens spent
- Tag `v1.0.0`
- Celebrate 🎉

---

## Risks

- **Risk**: Interactive CLI misbehaves in non-TTY environments (CI, scripts). Mitigation: `--no-interactive` flag with env var fallbacks.
- **Risk**: Hook injection corrupts user's `settings.json`. Mitigation: backup always, validate JSON before write, atomic rename.
- **Risk**: npm publish requires credentials. Mitigation: this is a manual step by project owner, not autonomous. Document in release.md, STOP if blocked.

---

## Out of Scope for v1.0

Deferred to future versions:

- Multi-tenant dashboard
- Team-level shared queue
- Plugin system
- Cloud-hosted option
- Non-English UI
- Voice commands
- ML-based session scheduling

---

## Definition of Done

A project owner can:
1. Install Orch on a new machine in under 5 minutes
2. Attach their existing project in under 60 seconds
3. Have Orch process their first plan autonomously within 2 minutes
4. Monitor everything via Telegram or Web UI
5. Understand what happened from traces if something fails
6. Share this with a peer who can repeat all of the above without guidance
