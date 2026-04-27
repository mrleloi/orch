# Orch — Personal Claude Code Orchestration Daemon

<!-- Replace <OWNER>/<REPO> with the real GitHub owner/repo slug on first push. -->
![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)

Orch is a self-hosted daemon that handles the mechanical work around Claude Code sessions:
account switching on rate limits, context-boundary handoff, queue processing of prepared plans,
and notification and remote control via Telegram and a local Web UI. The daemon is deterministic
code; LLM reasoning lives exclusively inside the Claude Code sessions it spawns. Orch is not an
agent framework — it is a dumb scheduler for smart workers.

## Why

- **Subscription quota exhaustion mid-task.** Claude Code rate-limits in the middle of a session,
  requiring a manual account switch via `ccs` and a session restart. Orch detects the limit event
  and fails over to a configured fallback `ccs` profile automatically, without interrupting the
  queue. (Charter §The Core Insight)

- **Context window fills at ~250K tokens.** The human must type `/session-end`, start a new
  session, and re-establish context by hand. Orch monitors the OTEL token span, gracefully closes
  the current session, and spawns the next one with a structured handoff context block. (Charter
  F4, O4)

- **Plans queue up but dispatch is manual.** Prepared plan files must be dispatched one at a time.
  Orch watches `session-plans/pending/`, accepts plans via Telegram command or HTTP webhook, and
  auto-advances through the queue — including retry-with-quarantine on repeated failure. (Charter
  F1, F9)

## Quick Start

```bash
# Install the CLI (replace <scope> with the published npm scope — see docs/release.md)
npm install -g @<scope>/orch-cli

# One-time: create ~/.orch/, generate auth token
orch init

# Attach a managed project (interactive — writes .orch/profile.yaml)
orch attach <project-path>

# Boot the daemon (default port 4141)
orch start

# Drop a plan file to start work
cp my-plan.md <project-path>/agent-workspace/session-plans/pending/
```

Orch picks up the plan, spawns Claude Code via `ccs`, handles rate limits and context boundaries,
and reports back via Telegram and the Web UI.

## Architecture

```
  Human operator
       │
       ├── Telegram commands (/status, /queue, /pause, /resume, /tail)
       ├── Web UI            (localhost:4141, queue kanban + live tail)
       └── CLI               (orch init / attach / start / stop / status)
                │
                ▼
     ┌──────────────────────┐
     │      Orch daemon      │  NestJS + Fastify, port 4141
     │  state machine + queue│  Prisma + SQLite (WAL mode)
     │  OTEL span ingestion  │  OpenTelemetry → Langfuse / SigNoz
     └──────────┬───────────┘
                │  spawn via ccs + claude CLI subprocess
                ▼
     ┌──────────────────────┐
     │  Claude Code session  │  IAgentRuntime adapter
     │  (claude CLI process) │  hooks POST back to daemon
     └──────────┬───────────┘
                │  reads .orch/profile.yaml
                ▼
     ┌──────────────────────┐
     │   Managed project     │  any repo with .orch/profile.yaml
     │   .orch/  .claude/   │  one daemon → N projects
     └──────────────────────┘
```

Full breakdown: [docs/architecture.md](docs/architecture.md).

## Features

- Automatic failover to configured `ccs` fallback profiles on rate-limit events
- Context-boundary detection via OTEL token spans with structured session handoff
- File-drop, Telegram, and HTTP webhook queue intake with retry-and-quarantine
- OpenTelemetry tracing for every session: cost attribution per project, per day, per session type
- Hooks-driven event capture (`PreToolUse`, `PostToolUse`, `Stop`) posted to daemon HTTP endpoint
- Telegram bot interface: `/status`, `/queue`, `/pause`, `/resume`, `/tail` commands
- Web UI dashboard: live session list, queue kanban, token/cost chart, trace deep-links
- Prisma + SQLite persistence with WAL mode (crash-safe queue state)
- Project-agnostic via `.orch/profile.yaml` — one daemon manages N projects with no code changes
- Optional observability stack via Docker Compose (Langfuse self-hosted, SigNoz alternative)

## Requirements

- Node.js 20 or 22
- pnpm 9+
- [`ccs`](https://github.com/<owner>/ccs) — account/profile switching CLI
  <!-- Replace <owner> with the real ccs repo owner on release -->
- `claude` CLI (Anthropic) — Orch spawns it as a subprocess; it does NOT use the Agent SDK
  (Anthropic ToS, April 2026, restricts SDK chat-sending with subscription accounts)
- Optional: Docker + Docker Compose (for the observability and full profiles)

## Docker (optional)

Three Compose profiles are available:

```bash
# Daemon only (SQLite, port 4141)
docker compose up -d

# + Langfuse trace UI (port 3100) + Postgres
docker compose --profile observability up -d

# + Web UI preview (port 4142) — requires observability
docker compose --profile observability --profile full up -d
```

Override secrets and ports via `.env` at the repo root. See `docker-compose.yml` for all
`${VAR:-default}` variables. Never commit real credentials.

## Web UI

<!-- TODO: replace with real screenshot at v1.0 release tag -->
_Screenshot placeholder — Web UI dashboard with live session list, queue, and trace links._

## Documentation

- [Quick Start](docs/quickstart.md)
- [Configuration Reference](docs/configuration.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Architecture](docs/architecture.md)
- [Release Process](docs/release.md)

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+, TypeScript strict |
| Daemon framework | NestJS + Fastify |
| Persistence | Prisma + SQLite (WAL mode) |
| Telegram | Grammy |
| Web UI | React + Vite + Tailwind + shadcn/ui |
| Observability | OpenTelemetry → Langfuse self-hosted (default) or SigNoz |
| Monorepo | pnpm workspaces |
| Subprocess | execa (no `@anthropic-ai/claude-agent-sdk`) |

## Integration Surface

A managed project integrates with Orch in two steps:

1. Run `orch attach <project-path>` — interactively writes `.orch/profile.yaml`.
2. Optionally inject lifecycle hooks into `.claude/settings.json` (prompted during attach).

No code changes to the managed project. No `require('@orch/...')`. Orch crashing does not
affect the project's own Claude Code usage. See `examples/stockforge-integration/` for a
worked example.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [PROJECT_CHARTER.md](PROJECT_CHARTER.md) for the immutable invariants that govern all
contributions. A `CONTRIBUTING.md` will be added in a follow-up release task.

## Support

Open an issue on GitHub. See the `examples/` folder for worked integration examples and
the [Troubleshooting guide](docs/TROUBLESHOOTING.md) for common failure modes.
