# Troubleshooting

> Common issues for Orch operators and during autonomous execution.
> For configuration reference, see [`docs/configuration.md`](configuration.md).

---

## Daemon & Runtime Issues

### Daemon won't start

**Symptom**: `orch start` exits immediately or the process crashes on boot.

**Likely causes and fixes**:

1. **Port conflict** — another process is already on `ORCH_HTTP_PORT` (default `4141`).
   ```bash
   # Find what's using the port:
   lsof -i :4141        # macOS / Linux
   netstat -ano | findstr :4141  # Windows
   ```
   Change `ORCH_HTTP_PORT` to a free port in your `.env` or shell profile.
   See [`docs/configuration.md`](configuration.md#daemon-core) for variable reference.

2. **Missing `~/.orch/` directory** — `orch init` was not run, or `ORCH_HOME` points
   to a non-existent path.
   ```bash
   orch init              # creates ~/.orch/ and scaffolds config
   # or manually:
   mkdir -p ~/.orch/projects
   ```

3. **Auth-token file missing or wrong permissions** — `ORCH_HOOK_SECRET` and
   `ORCH_API_BEARER_TOKEN` are required at startup; the daemon throws if either is
   absent.
   ```bash
   # Verify they are set in your environment:
   echo $ORCH_HOOK_SECRET
   echo $ORCH_API_BEARER_TOKEN
   ```
   If both are unset, run `orch init` — it generates both tokens and writes them to
   `~/.orch/.env`.

4. **Diagnostic** — set `ORCH_LOG_LEVEL=debug` for verbose boot output:
   ```bash
   ORCH_LOG_LEVEL=debug orch start 2>&1 | head -50
   ```

---

### Hooks not firing

**Symptom**: Sessions spawn but the daemon's state machine never transitions past
`running`; no hook events appear in logs.

**Diagnostic**: Enable debug logging and check for incoming `POST /projects/:id/hooks/:type`
requests:
```bash
ORCH_LOG_LEVEL=debug orch start
```

**Likely causes**:

1. **Hook injection didn't run** — check `.claude/settings.json` in the managed
   project for an `orch` stanza under `hooks`. If absent, re-run:
   ```bash
   orch init --project /path/to/managed-project
   ```

2. **Stale orphan session** — a session started before hook injection will never
   emit hooks. Terminate it and let the scheduler pick up the next queue item with
   injection in place.

3. **Hook script not executable (Linux/macOS)** — the injected hook script must
   have execute permission:
   ```bash
   chmod +x ~/.orch/hooks/orch-hook.sh
   ```

4. **Claude Code version mismatch** — hooks were introduced in Claude Code
   v1.x. Check `claude --version`; upgrade if below the minimum required version
   listed in the project README.

5. **`ORCH_HOOK_SECRET` mismatch** — the daemon rejects requests with a wrong
   or missing `X-Orch-Hook-Secret` header (401). Verify the secret in
   `.claude/settings.json` matches the daemon's `ORCH_HOOK_SECRET` env var.

---

### ccs account switching not working

**Symptom**: Rate-limit errors accumulate but the daemon doesn't switch to a
fallback ccs profile; sessions queue up and stall.

**Diagnostic**:
```bash
ccs status                  # list profiles and quota state
ORCH_LOG_LEVEL=debug orch start  # watch for RateLimitError and profile selection
```

**Likely causes**:

1. **Quota not visible to ccs** — `ccs status` may not reflect real-time quota.
   Wait for the rate-limit window to pass, or authenticate a fresh profile:
   ```bash
   ccs auth <profile-name>
   ```

2. **Fallback chain not configured** — the `ccsProfiles` field in
   `.orch/profile.yaml` must list profiles in priority order. If only one profile
   is listed, there is nothing to fall back to:
   ```yaml
   ccsProfiles:
     - primary
     - backup1
     - backup2
   ```

3. **Primary profile rate-limited but daemon shows no switch** — check the debug
   log for `RateLimitError`. If it appears but no switch follows, verify that the
   fallback profiles are authenticated (`ccs status` shows `active` for each).

4. **ccs not on PATH** — the daemon spawns `ccs` as a subprocess. Verify:
   ```bash
   which ccs
   ccs doctor
   ```

---

### OTEL traces missing

**Symptom**: Sessions run but no spans appear in Langfuse, Grafana, or your
configured collector.

**Diagnostic**:
```bash
echo $ORCH_TRACE_BACKEND
echo $OTEL_EXPORTER_OTLP_ENDPOINT
curl -s $OTEL_EXPORTER_OTLP_ENDPOINT/health  # or equivalent
```

**Likely causes**:

1. **`ORCH_TRACE_BACKEND=none`** — tracing export is disabled. Change to `otlp`
   or `langfuse`. See [`docs/configuration.md`](configuration.md#tracing--otel).

2. **`OTEL_EXPORTER_OTLP_ENDPOINT` not set or wrong** — required when
   `ORCH_TRACE_BACKEND=otlp`. Default for local Grafana LGTM stacks:
   `http://127.0.0.1:4318`.

3. **Collector not running** — verify the backend container is up:
   ```bash
   docker ps | grep -E 'langfuse|grafana|otel'
   ```

4. **Network connectivity** — the daemon connects to the OTLP endpoint from the
   same host. Collector failures are `warn`-level only — they do not crash the
   daemon. Check `ORCH_LOG_LEVEL=debug` output for `OTLP export failed` lines.

5. **Langfuse auth missing** — when `ORCH_TRACE_BACKEND=langfuse`, all three of
   `LANGFUSE_OTLP_ENDPOINT`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY`
   must be set. The daemon throws on startup if any is missing.

---

### Telegram bot silent

**Symptom**: Sessions complete but no Telegram messages arrive.

**Diagnostic**:
```bash
# Verify the bot token is reachable:
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

**Likely causes**:

1. **Invalid bot token** — the `getMe` call above returns `{"ok":false}`. Create
   a new token via `@BotFather` on Telegram and update `TELEGRAM_BOT_TOKEN`.

2. **User not in whitelist** — the `@orch/telegram` package validates sender IDs
   against `TELEGRAM_ALLOWED_USER_IDS`. Add your numeric user ID:
   ```bash
   # Find your ID: message @userinfobot on Telegram
   TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
   ```

3. **Bot privacy mode** — in groups, bots with privacy mode enabled receive only
   commands, not all messages. Use `@BotFather` → Bot Settings → Group Privacy →
   disable, or add the bot as admin.

4. **Network egress blocked** — the bot package calls `api.telegram.org`. Verify
   outbound HTTPS is allowed from the machine running Orch.

5. **`@orch/telegram` package not started** — `orch start` starts the core daemon
   only. The Telegram bot is a separate process:
   ```bash
   pnpm -C packages/telegram start
   ```

---

### SQLite lock errors

**Symptom**: `SQLITE_BUSY` or `database is locked` errors in daemon logs under
load.

**Likely causes and fixes**:

1. **WAL mode not applied** — Orch configures Prisma to use WAL mode at boot.
   Verify the db file is not a read-only bind mount (see below). Check daemon
   startup logs for `PRAGMA journal_mode=WAL` confirmation.

2. **Concurrent writes from two daemon instances** — SQLite allows one writer at a
   time. Ensure only one `orch start` process runs against the same `orch.db`.
   Use `ORCH_HOME` to point each instance at a separate home directory if running
   multiple daemons.

3. **Container bind-mount on Windows host (Docker Desktop)** — Docker Desktop
   translates Windows NTFS paths to Linux ext4 mounts via WSL2. WAL mode
   requires `fsync` support that some bind-mount configurations lack. Fix options:
   - Move `ORCH_HOME` inside the WSL2 filesystem (`/home/<user>/.orch`) rather
     than a Windows host path.
   - Use a named Docker volume instead of a bind mount.

4. **Long-running read transaction blocking writes** — the dashboard's SSE tail
   endpoint holds a read connection. Verify Prisma connection pool settings allow
   WAL concurrent readers. Default pool size of 1 serialises all DB access; raise
   to 3-5 for dashboard-heavy usage.

---

## Claude Code Issues

### Claude keeps asking me questions in autonomous mode

### Claude keeps asking me questions in autonomous mode

**Symptom**: Agent presents options and waits for input.

**Cause**: Autonomous mode instruction didn't register, or the agent interpreted task as genuinely ambiguous (STOP-3 candidate).

**Fix**: Paste:
```
Apply agent-workspace/constitution/autonomous-protocol.md strictly.
Do not ask me questions. Apply Decision Rules 1-7. Document choice
in agent-workspace/memory/decisions/ and proceed.
```

If it persists on the same question after that, it's probably genuinely ambiguous → let it STOP-3 and address the spec gap.

---

### Agent loops on the same error

**Symptom**: Same task attempted 3+ times with different fixes, gate still fails.

**Cause**: Likely STOP-1 but not yet written to escalation.

**Fix**: Paste:
```
STOP. Do not attempt this task again. Write agent-workspace/memory/escalation.md
with:
- Task ID and description
- Expected behavior
- Observed error (exact text)
- 3 fix attempts and why each failed
- Your current hypothesis

Then wait for me.
```

---

### Agent is going out of scope

**Symptom**: Agent is refactoring files not in current task, adding features not in spec.

**Cause**: Karpathy P3 (surgical changes) violation.

**Fix**: Paste:
```
Revert unrelated changes. Re-read Karpathy principle P3 in
constitution/karpathy-principles.md. Every changed line must trace to
the current task. Run /invariant-check.
```

---

### Agent claims task done but gates fail

**Symptom**: Session log says "COMPLETED" but typecheck or tests fail.

**Fix**: Paste:
```
Re-read session-budgets.md § Pre-Submission Checklist. Run all three
gates: pnpm run typecheck && pnpm run lint && pnpm run test. Report
exact output. Do not advance until all pass.
```

---

## Context / Session Issues

### Agent approaches 250K but doesn't end session

**Symptom**: Context filling up, agent continues mid-task.

**Fix**: Paste:
```
Run /budget-check immediately. If >85%, finalize current subtask and
run /session-end. Do NOT try to push through past 250K.
```

---

### Next session doesn't pick up where previous left off

**Symptom**: Resume context missing, agent starts from scratch.

**Cause**: Previous `/session-end` didn't write a proper "Next Session Pickup" block.

**Fix**: Paste:
```
Read the 3 most recent session logs in agent-workspace/memory/sessions/.
Read current-execution.md. Infer pickup state from git diff and file
modifications. If still unclear, write escalation.md.
```

---

### `/session-end` won't trigger phase advance

**Symptom**: All phase criteria look done but agent doesn't advance.

**Cause**: One or more success criteria still showing ❌ (often a file or test that wasn't verified).

**Fix**: Paste:
```
Run /phase-advance. If it reports unmet criteria, address each one
specifically before retrying. Do not force-advance.
```

---

## Environment Issues

### `git clone` fails in reference-repos/

**Symptom**: Phase 0 task 0.6/0.7/0.8 fails with network error.

**Cause**: Network restricted, allowlist missing github.com, or credential issue.

**Fix**:
1. Verify `.claude/settings.json` allowlist includes `Bash(git clone --depth 1:*)`
2. Test manually: `git clone --depth 1 https://github.com/NachoSEO/claudegram reference-repos/claudegram`
3. If SSH keys needed, use HTTPS URLs
4. Check the network_configuration in your Claude Code setup

---

### OTEL endpoint unreachable

**Symptom**: Tracing backend (Langfuse/SigNoz) not receiving spans.

**Fix**:
1. Verify backend is running: `docker ps | grep langfuse` or `curl http://localhost:3000`
2. Verify env vars set: `echo $OTEL_EXPORTER_OTLP_ENDPOINT`
3. Try disabling OTEL temporarily: set `ORCH_OTEL_ENABLED=false` in settings env
4. Agent can proceed without OTEL — traces just lost until fixed

---

### ccs can't find a working profile

**Symptom**: `ccs <profile>` returns auth error.

**Fix**: Not an Orch issue — resolve via ccs:
```bash
ccs doctor
ccs auth <profile>   # re-authenticate
```

Then restart Claude Code session.

---

### Claude CLI not found (ENOENT)

**Symptom**: `claude --version` fails, or adapter spawn raises RuntimeUnavailableError.

**Fix**:
1. Verify install: `which claude`
2. If missing: reinstall via https://claude.com/download
3. Verify PATH includes install location
4. If using ccs wrapper: `ccs doctor` also checks Claude CLI availability

---

## Invariant Violations

### I-1 violation: SDK import found

**Symptom**: `/invariant-check` reports `@anthropic-ai/*` import in `packages/core/src/`.

**Cause**: Agent drifted into SDK usage.

**Fix**: Paste:
```
Read constitution/invariants.md I-1 and I-3 again. Remove the SDK
imports. Use ClaudeCodeAdapter CLI subprocess path. Update tests.
Re-run /invariant-check.
```

This is a STOP-4 level violation if not caught quickly.

---

### I-2 violation: project name hardcoded

**Symptom**: `grep stockforge packages/core/src/` returns hits.

**Cause**: Agent hardcoded a specific project's name.

**Fix**: Paste:
```
All project-specific references must be config-driven via
profile.yaml. Read constitution/invariants.md I-2. Replace hardcoded
references with config lookups. Update tests.
```

---

### I-14 violation: module-level mutable state

**Symptom**: `grep -rn "^let\s\|^var\s" packages/core/src/` returns hits.

**Fix**: Paste:
```
Refactor to use NestJS service with injected state. Module-level
mutable state is an invariant violation. See constitution/invariants.md I-14.
```

---

## Phase-Specific Issues

### Phase 0: Research notes too shallow

**Symptom**: research files < 50 lines, missing sections.

**Fix**: Paste:
```
Re-invoke research-scanner for <repo> with explicit instruction to
produce all template sections from research-protocol.md. Budget:
25K for Tier A, 15K for Tier B.
```

---

### Phase 1: State machine tests flaky

**Symptom**: Integration tests intermittent.

**Cause**: Shared SQLite file across tests, timing-sensitive assertions.

**Fix**: Paste:
```
Refactor state machine tests to:
1. Use in-memory SQLite (`:memory:`)
2. Run tests serially (pool = forks or single-thread)
3. Use fake timers (vi.useFakeTimers) for anything time-dependent
4. No shared state between tests
```

---

### Phase 2: Telegram bot crashes on network error

**Symptom**: Bot restarts loop after network hiccup.

**Fix**: Paste:
```
Wrap Grammy bot init in retry-with-backoff. Use grammy's built-in
flood control. Read skills/grammy-bot/SKILL.md for error handling
patterns. Tests should mock network failures.
```

---

### Phase 3: Context-full detection false positive

**Symptom**: Agent ends sessions prematurely.

**Fix**: Paste:
```
Review OTEL span attribute parsing in context-full detector. Confirm
you're reading gen_ai.usage.input_tokens from claude_code.interaction
spans, not from every sub-span (which would double-count). Add unit
test with recorded span data.
```

---

### Phase 4: npm link doesn't work locally

**Symptom**: Testing `orch init` from a different directory fails.

**Fix**:
```bash
cd packages/cli
pnpm link --global
cd /tmp
mkdir test-orch
cd test-orch
orch init
```

If still failing, check `bin` field in `packages/cli/package.json`.

---

## Memory / State Issues

### `current-execution.md` out of sync with reality

**Symptom**: Says Phase 2 but directory shows Phase 1 incomplete.

**Fix**: Paste:
```
Read the last 5 session logs in agent-workspace/memory/sessions/.
Read phase-N-complete.md files to see which phases actually
finished. Reconcile current-execution.md with the evidence. Do not
advance past incomplete phases.
```

---

### Multiple sessions with same number

**Symptom**: Two `session-N.md` files for same N.

**Cause**: Counter wasn't incremented, or two agents ran concurrently.

**Fix**: Rename the newer one to the next number, update cross-references.

---

## Escalation Patterns

### When to write `escalation.md`

- Gate failure × 3
- Environment unrecoverable
- Charter contradiction in spec
- About to take irreversible destructive action
- Multiple decision rules point to different answers

### What to write

```markdown
# Escalation — <DATE> <TIME>

## Phase / Task
Phase N, Task N.M: <title>

## Summary
<2-3 sentences>

## Attempts (if STOP-1)
1. <what>  → <result>
2. <what>  → <result>
3. <what>  → <result>

## Current Hypothesis
<your best guess>

## Specific Question for User
<exactly what you need answered>

## Suggested Resolutions
A. <option with tradeoffs>
B. <option with tradeoffs>
```

### When the user responds

User will:
1. Address the specific question
2. Tell you to delete `escalation.md`
3. Give you a hint to continue with

Don't resume until `escalation.md` is explicitly removed — it's the signal that the block is cleared.

---

## Getting Unstuck

If all else fails:

1. `git stash` any uncommitted work
2. Restart Claude Code session
3. Paste: `Read CLAUDE.md, autonomous-protocol.md, and current-execution.md. Tell me where we are and what the next step is. Do not take any action.`
4. Based on diagnosis, give a targeted instruction
