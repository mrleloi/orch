# StockForge Integration Example

This folder shows how to wire up an Orch daemon to manage Claude Code sessions in a StockForge project. The same pattern applies to any project — only the profile values differ.

> **I-2 exception (project-agnostic core rule):** The strings `stockforge` that appear in
> `profile.yaml` and this README are fixture data for copy-paste reference only. They are
> NEVER imported by `packages/core/` — the Orch core is fully project-agnostic. If you run
> `grep -r stockforge packages/core/src/` the result will be empty.

## What this does

Orch acts as a scheduler between you and Claude Code. Once integrated:
- Plan files dropped into `session-plans/pending/` are picked up automatically and dispatched to Claude Code.
- Hook events (SessionStart, Stop, etc.) stream back to the daemon so it can track session state, detect rate-limit errors, and trigger failover.
- All session activity is traced to OpenTelemetry (LGTM stack) for visibility.

---

## 3-Step Setup

### Step 1: Init Orch and attach StockForge

```bash
# From the orch-starter directory, build and link the CLI
pnpm install && pnpm build

# Initialise Orch (creates ~/.orch/ directory structure)
orch init

# Attach StockForge as a managed project
orch attach /path/to/stockforge
```

The attach command copies a skeleton `profile.yaml` to `<stockforge>/.orch/profile.yaml` and registers the project with the daemon.

### Step 2: Copy profile.yaml into StockForge

```bash
cp examples/stockforge-integration/profile.yaml /path/to/stockforge/.orch/profile.yaml
```

Open the file and adjust the two required paths:

```yaml
rootPath: "C:\\htdocs\\stockforge"       # absolute path to StockForge root
ccsProfile: nathanleewindy               # your ccs profile name (run: ccs list)
```

The session types (`backtest`, `strategy-generation`, `live-trading-simulation`) and hook targets are pre-configured for StockForge's typical workload. Add or rename them to match your actual session taxonomy.

### Step 3: Merge hooks-snippet.json and set ORCH_HOOK_SECRET

**Set the hook secret (add to `~/.zshrc` or `~/.bashrc`):**

```bash
export ORCH_HOOK_SECRET="<your-random-secret>"
```

Generate one with: `openssl rand -hex 32`

The same value must appear in Orch's daemon config (or `ORCH_HOOK_SECRET` env var when you start the daemon).

**Merge the hook commands into StockForge's `.claude/settings.json`:**

```bash
# Back up first
cp /path/to/stockforge/.claude/settings.json /path/to/stockforge/.claude/settings.json.backup
```

This folder contains two hook snippets:

- `settings.json` — four canonical hooks using the `orch-receiver.sh` pattern from Task 4.5 (recommended).
- `hooks-snippet.json` — eight hooks using direct `curl` commands (legacy; still functional if you prefer no script dependency).

Use the `settings.json` entries for new integrations. Copy the four entries under `"hooks"` into the `"hooks"` object of `/path/to/stockforge/.claude/settings.json`. If that file doesn't have a `"hooks"` key yet, add one.

Example merge result:

```json
{
  "hooks": {
    "SessionStart": [ ... ],
    "SessionEnd": [ ... ],
    "UserPromptSubmit": [ ... ],
    "PreToolUse": [ ... ],
    "PostToolUse": [ ... ],
    "PreCompact": [ ... ],
    "Stop": [ ... ],
    "Notification": [ ... ]
  }
}
```

---

## Verification

Start the Orch daemon, then open a Claude Code session inside the StockForge directory. You should see hook payloads arriving at the daemon within seconds.

**Check daemon logs:**

```bash
tail -f ~/.orch/logs/*.log
```

**Query active sessions via the REST API:**

```bash
curl -s http://127.0.0.1:4141/api/v1/sessions/active \
  -H "Authorization: Bearer <your-api-token>" | jq .
```

**Check daemon health:**

```bash
curl -s http://127.0.0.1:4141/healthz
# Expected: {"status":"ok"}
```

---

## Troubleshooting

**401 Unauthorized from the hooks receiver**

The hook POST is sending the wrong secret or no secret. Verify:
1. `ORCH_HOOK_SECRET` is exported in the shell where Claude Code runs.
2. The daemon was started with the same secret value.
3. The hook commands in `.claude/settings.json` reference `${ORCH_HOOK_SECRET}` (not a literal string).

**Hooks time out or curl fails with "Connection refused"**

The Orch daemon is not running or is bound to a different port.
- Default port: `4141` (set via `ORCH_HTTP_PORT`).
- Check: `curl -s http://127.0.0.1:4141/healthz`
- Start the daemon: `orch start` (or `pnpm dev` in orch-starter during development).

**Profile schema mismatch — project not loaded**

The daemon logs will show a `ProfileValidationError` with the exact failing field. Common causes:
- `projectId` contains uppercase letters or spaces (must be `^[a-z0-9-]+$`).
- `rootPath` is a relative path (must be absolute).
- `sessionTypes` array is empty (at least one entry required).
- `ccsProfile` is missing or empty.

Fix the YAML, then reload: `orch reload` or `POST http://127.0.0.1:4141/admin/reload`.
