# Orch — Quick Start Guide

> Step-by-step walkthrough from zero to a running daemon with a managed project.
> Commands verified against Orch v1.0 state (2026-04-27).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Configuration](#3-configuration)
4. [First Run](#4-first-run)
5. [Session Monitoring](#5-session-monitoring)
6. [OTEL / Tracing (Optional)](#6-otel--tracing-optional)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

Before installing Orch, ensure the following are in place on the machine where the daemon
will run.

### Node.js 20+

```bash
# verified: 2026-04-27
node --version
# Expected: v20.x.x or v22.x.x
```

If you need to install or switch versions, [nvm](https://github.com/nvm-sh/nvm) is recommended:

```bash
# verified: 2026-04-27
nvm install 20
nvm use 20
```

### pnpm 9+

```bash
# verified: 2026-04-27
npm install -g pnpm@9
pnpm --version
# Expected: 9.x.x
```

### ccs CLI (Claude Code account switcher)

`ccs` handles multi-account profile switching. Orch calls it as a subprocess to spawn
`claude` under the correct profile.

```bash
# verified: 2026-04-27
# Install from the ccs repository (replace <owner> with the actual GitHub owner)
npm install -g @<owner>/ccs

# Verify
ccs --version

# Create at least one profile (interactive)
ccs add
ccs list
# Expected: at least one profile listed, e.g. "work" or "default"
```

### Claude CLI and Account

Orch spawns `claude` as a subprocess. It does NOT use the Anthropic Agent SDK
(Anthropic ToS, April 2026, restricts Agent SDK chat-sending with subscription accounts).

```bash
# verified: 2026-04-27
claude --version
# Expected: Claude Code vX.Y.Z
```

If `claude` is not installed, follow the [Claude Code setup guide](https://claude.ai/code)
and authenticate at least once before continuing.

---

## 2. Installation

### Clone the repository

```bash
# verified: 2026-04-27
git clone https://github.com/<OWNER>/<REPO>.git orch
cd orch
```

### Install dependencies

```bash
# verified: 2026-04-27
pnpm install
# Expected: packages installed, no peer-dependency errors
```

### Build all packages

```bash
# verified: 2026-04-27
pnpm build
# Expected: packages/core, packages/cli, packages/telegram, packages/web-ui all compile
# Output ends with something like: "Done in Xs"
```

The built CLI binary will be available at `packages/cli/dist/index.js`.
For a global `orch` command during development, link it:

```bash
# verified: 2026-04-27
pnpm --filter @orch/cli link --global
orch --version
# Expected: 0.1.0 (or current version)
```

---

## 3. Configuration

### Global daemon init

The first-time `orch init` creates `~/.orch/` with an auth token and default daemon config.

```bash
# verified: 2026-04-27
orch init
# Prompts:
#   Daemon port [4141]:        <press Enter for default>
#   Generate auth token?  [Y]: Y
# Output: ~/.orch/config.json written, token saved
```

### Project profile — `.orch/profile.yaml`

Each managed project has a `.orch/profile.yaml` that tells Orch its identity, which `ccs`
profile to use, what session types to run, and where to find plan files.

Create the `.orch/` directory in your project and copy the minimal profile:

```bash
# verified: 2026-04-27
mkdir -p <your-project-path>/.orch
cp examples/generic-nodejs-project/profile.yaml <your-project-path>/.orch/profile.yaml
```

Edit the file. A minimal working example:

```yaml
# <your-project-path>/.orch/profile.yaml
# verified: 2026-04-27

# URL-safe identifier (lowercase, hyphens allowed, no spaces)
projectId: my-app

# Absolute path to your project on this machine
rootPath: "/absolute/path/to/<your-project-path>"

# Name of the ccs profile to use (run `ccs list` to see options)
ccsProfile: "default"

# Maximum active sessions at once
maxConcurrentSessions: 1

sessionTypes:
  - name: impl
    promptTemplate: |
      You are executing an implementation task.
      Plan: {{plan}}
      Follow the plan exactly. Stage changes. Do NOT commit unless the plan says so.
    maxConcurrent: 1

hookTargets:
  - event: SessionStart
    url: "http://127.0.0.1:4141/hooks/SessionStart"
  - event: Stop
    url: "http://127.0.0.1:4141/hooks/Stop"
  - event: PostToolUse
    url: "http://127.0.0.1:4141/hooks/PostToolUse"

queueSources:
  - path: "/absolute/path/to/<your-project-path>/session-plans/pending"
    glob: "*.md"

langfuseEnabled: false
```

All fields are validated against `ProfileSchema` in
`packages/core/src/domain/profile.ts` on daemon start. Invalid profiles block
registration and print a schema diff to stderr.

### Plan queue directory

Orch watches the `queueSources` paths for `*.md` files. Create the directory now:

```bash
# verified: 2026-04-27
mkdir -p <your-project-path>/session-plans/pending
mkdir -p <your-project-path>/session-plans/done
mkdir -p <your-project-path>/session-plans/quarantine
```

---

## 4. First Run

### Attach the project

`orch attach` registers your project with the running (or about-to-start) daemon and
optionally injects hooks into the project's `.claude/settings.json`.

```bash
# verified: 2026-04-27
orch attach <your-project-path>
# Interactive prompts:
#   Project ID detected: my-app  [Y/n]: Y
#   Inject Claude Code hooks into .claude/settings.json? [Y/n]: Y
# Output: profile validated, project registered, hooks written
```

Hook injection writes `PreToolUse`, `PostToolUse`, `Stop`, and `SessionStart` entries
into `<your-project-path>/.claude/settings.json` so every Claude Code session
running inside that project posts lifecycle events back to the daemon. The injection
logic lives in `packages/core/src/modules/hooks-receiver/inject-hooks.ts`.

### Start the daemon

```bash
# verified: 2026-04-27
orch start
# Expected output:
#   [Orch] Daemon listening on http://127.0.0.1:4141
#   [Orch] Project registered: my-app  (rootPath: /absolute/path/to/<your-project-path>)
#   [Orch] Queue watcher active: session-plans/pending/*.md
```

The daemon runs in the foreground. Use a process manager (pm2, systemd, or a tmux
window) for persistent operation.

### Drop a plan file to queue a task

```bash
# verified: 2026-04-27
cp my-plan.md <your-project-path>/session-plans/pending/001-my-first-task.md
# Expected: daemon logs show "Plan enqueued: 001-my-first-task.md"
#           Claude Code session spawns within a few seconds
```

Orch picks up the file, validates it, spawns `claude` via `ccs run <ccsProfile>`,
and injects the plan content into the session prompt. On completion, the file is
moved to `session-plans/done/`.

---

## 5. Session Monitoring

### Web UI (default: http://localhost:4141)

The Web UI is served by the daemon on the same port as the HTTP API.

Open a browser and navigate to:

```
http://localhost:4141
```

The dashboard shows:

- **Queue kanban**: pending / active / done / quarantine columns
- **Live tail**: streaming stdout from the active Claude Code session
- **Token / cost chart**: OTEL span data per session and per project
- **Trace deep-links**: jump to Langfuse or SigNoz for a full trace

No additional setup is needed — the UI is bundled and served by the NestJS daemon.

### Telegram bot (optional but recommended)

A Telegram bot lets you monitor and control the daemon from your phone.

**Step 1 — Create a bot via BotFather**

Open Telegram, search for `@BotFather`, and run:

```
/newbot
```

Copy the **Bot Token** it provides (format: `123456789:AABBcc...`).

**Step 2 — Find your Telegram chat ID**

Send any message to your new bot, then call:

```bash
# verified: 2026-04-27
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
# Look for: result[0].message.chat.id
```

**Step 3 — Configure Orch**

Add the token and your chat ID to `~/.orch/config.json` (or as environment variables):

```bash
# verified: 2026-04-27
# Environment variable approach (preferred — keeps secrets out of config files)
export ORCH_TELEGRAM_TOKEN="123456789:AABBcc..."
export ORCH_TELEGRAM_CHAT_ID="987654321"

# Then restart the daemon
orch start
```

**Available commands in Telegram:**

| Command | Description |
|---|---|
| `/status` | Current daemon status and active session |
| `/queue` | List pending / done plan files |
| `/pause` | Pause the queue (finish current session, stop picking up new ones) |
| `/resume` | Resume a paused queue |
| `/tail` | Stream the last 30 lines of active session stdout |

---

## 6. OTEL / Tracing (Optional)

Orch emits OpenTelemetry spans for every session: start/end timestamps, token counts,
cost attribution, tool-call events, and rate-limit detections.

### Langfuse (self-hosted, default)

```bash
# verified: 2026-04-27
# Start the full observability stack (Langfuse + Postgres)
docker compose --profile observability up -d

# Langfuse UI: http://localhost:3100
# Default credentials: see docker-compose.yml LANGFUSE_* variables
```

Set the OTEL exporter endpoint in your environment before starting the daemon:

```bash
# verified: 2026-04-27
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:3100/api/public/otel"
export OTEL_EXPORTER_OTLP_HEADERS="x-langfuse-public-key=<your-public-key>"
orch start
```

Enable per-project in `profile.yaml`:

```yaml
langfuseEnabled: true
```

### SigNoz (alternative)

SigNoz accepts standard OTLP. Point the exporter to its collector:

```bash
# verified: 2026-04-27
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
orch start
```

See the [SigNoz self-host docs](https://signoz.io/docs/install/self-host/) for setup.

### Disabling OTEL

If you do not need tracing, leave `OTEL_EXPORTER_OTLP_ENDPOINT` unset. The daemon
starts without an exporter and logs a single `[Orch] OTEL disabled (no endpoint set)`
line on startup.

---

## 7. Troubleshooting

### Error: `ccs: command not found`

**Cause**: `ccs` is not installed or not on `PATH`.

**Fix**:

```bash
# verified: 2026-04-27
npm install -g @<owner>/ccs
# Then verify:
ccs --version
```

If installed but not found, check that your npm global bin directory is on `PATH`:

```bash
# verified: 2026-04-27
npm bin -g
# Add the printed path to your PATH in ~/.bashrc or ~/.zshrc
```

---

### Error: `ProfileSchema validation failed` on daemon start

**Cause**: One or more required fields in `.orch/profile.yaml` are missing or have
invalid values (e.g., `projectId` contains spaces, `rootPath` is relative, or a
required `sessionTypes` entry is missing).

**Fix**:

```bash
# verified: 2026-04-27
# The daemon prints a schema diff to stderr. Read it carefully:
orch start 2>&1 | head -40
# Look for lines starting with: "  [profile] validation error:"
```

Common field mistakes:

| Field | Wrong | Correct |
|---|---|---|
| `projectId` | `"My App"` | `"my-app"` |
| `rootPath` | `"../my-app"` | `"/absolute/path/to/my-app"` |
| `sessionTypes` | omitted | at least one entry required |

---

### Error: Plan file not picked up by queue watcher

**Cause (most common)**: The `queueSources.path` in `profile.yaml` does not match
the actual directory, or the directory does not exist.

**Fix**:

```bash
# verified: 2026-04-27
# 1. Confirm the directory exists
ls <your-project-path>/session-plans/pending/

# 2. Confirm the profile path matches
grep -A2 "queueSources" <your-project-path>/.orch/profile.yaml

# 3. Drop a test file and watch daemon logs
echo "# test plan" > <your-project-path>/session-plans/pending/test.md
# Expected daemon log: "Plan enqueued: test.md"
```

If the watcher was started before the directory existed, restart the daemon after
creating the directory.

---

### Error: Daemon port 4141 already in use

**Cause**: Another process is bound to port 4141, or a previous daemon instance
did not shut down cleanly.

**Fix**:

```bash
# verified: 2026-04-27
# Find the process using the port
lsof -i :4141
# or on Windows:
netstat -ano | findstr :4141

# Kill the conflicting process (use its PID)
kill <PID>

# Or change the daemon port
export ORCH_HTTP_PORT=4242
orch start
# Update hookTargets URLs in profile.yaml to use the new port
```

---

### Error: Claude Code session exits immediately with no output

**Cause**: The `ccs` profile specified in `profile.yaml` does not exist, or
`claude` is not authenticated for that profile.

**Fix**:

```bash
# verified: 2026-04-27
# List available ccs profiles
ccs list

# Test the profile manually
ccs run <your-ccs-profile> -- claude --version
# Expected: Claude Code vX.Y.Z

# If auth is stale, re-authenticate
ccs auth <your-ccs-profile>
```

---

## Next Steps

- **Configuration reference**: full list of all `profile.yaml` fields →
  [docs/configuration.md](configuration.md)
- **Architecture overview**: how the daemon, adapters, and workers fit together →
  [docs/architecture.md](architecture.md)
- **Release process**: publishing packages and versioning →
  [docs/release.md](release.md)
- **Full troubleshooting guide**: edge cases and advanced diagnostics →
  [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md)
