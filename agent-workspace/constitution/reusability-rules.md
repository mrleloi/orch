# Reusability Rules

> Rules that make Orch installable/shareable across machines, users, teams — without forking.
> Charter Core Principle 8: "Reusable without forking."

---

## R-1: No Hardcoded Paths

Never hardcode:
- `/home/<username>/...`
- `/Users/<username>/...`
- Absolute paths to any specific project
- Author-specific config file locations

**Check**: `grep -rn "/home/\|/Users/\|/root/" packages/`

Must return zero results (outside test fixtures).

Replacements:
- `~/.orch/` → `path.join(os.homedir(), '.orch')` or `process.env.ORCH_HOME`
- Project paths → read from `profile.yaml`
- Temp dirs → `os.tmpdir()`

---

## R-2: Environment Variables with Defaults

All configurable behavior exposed via env vars with sensible defaults:

```typescript
// Good
const port = parseInt(process.env.ORCH_PORT ?? '3737');
const home = process.env.ORCH_HOME ?? path.join(os.homedir(), '.orch');
const logLevel = process.env.ORCH_LOG_LEVEL ?? 'info';

// Bad
const port = 3737; // not configurable
```

Document all env vars in `docs/configuration.md`.

---

## R-3: Cross-Platform

Must work on:
- Linux (primary)
- macOS (apple silicon + intel)
- Windows via WSL2 (Windows native not required but should not actively break)

**Check list**:
- No Unix-only path separators — use `path.join()`, not string concat
- No POSIX-only shell assumptions — avoid `sh -c`, prefer `execa` with argv array
- No hardcoded binary paths — use `which` or `ccs`/`claude` from PATH
- Handle both `\n` and `\r\n` line endings when parsing output

---

## R-4: Config-Driven Project Integration

A project joins Orch by:
1. Creating `.orch/profile.yaml` in its repo root
2. Optionally running `orch inject-hooks .` to add hook commands to `.claude/settings.json`

That's it. No code in the project to modify. No `require('@orch/...')`.

### Profile Schema (v1)

```yaml
# .orch/profile.yaml
schemaVersion: "1.0"
name: <project-slug>
path: <absolute-or-env-path>
description: <short>

runtime:
  adapter: "claude-code"  # or "codex"
  binary: "claude"         # command to spawn (via ccs typically)
  cli_flags_default: []    # e.g., ["--dangerously-skip-permissions"] (careful)

ccs:
  profiles:
    primary: "pro"
    fallback: ["work", "backup1"]
  auto_failover: true

session_types:
  # Inherit/customize from project's constitution
  - name: "PLAN"
    budget_tokens: 80000
  - name: "FOCUSED_IMPL"
    budget_tokens: 150000
  # ...

queue:
  sources:
    - type: "file_watcher"
      path: "agent-workspace/session-plans/pending"
      pattern: "*.md"
    - type: "telegram"
      enabled: true
    - type: "webhook"
      path: "/enqueue"
  priority_field: "priority"  # YAML frontmatter field in plan files

hooks:
  inject_into: ".claude/settings.json"
  events: [session-start, session-end, stop, subagent-stop, pre-tool-use]

notifications:
  telegram:
    chat_id: null  # set via `orch init`, do NOT commit
    events: [session_end, session_failed, rate_limited, context_near_limit]
  web_ui: true

context_policy:
  warn_at_tokens: 200000
  force_handoff_at_tokens: 230000
  handoff_strategy: "session-log"  # reads session-log before resume

budget:
  daily_tokens_max: 5000000
  per_session_tokens_max: 250000
  alert_on_breach: true

observability:
  otel_enabled: true
  langfuse_project: <optional-project-id>
```

---

## R-5: Secrets NEVER in Config Files

All of these MUST come from env or local-only secrets file (`.orch/secrets.yaml` in gitignore):

- Telegram bot token
- Anthropic/OpenAI API keys (if used)
- Langfuse project secret
- Webhook signing secrets

`profile.yaml` must be safe to commit to the project's public repo.

**Check**: `grep -rn "sk-\|ghp_\|xoxb-" packages/ examples/`

Must return zero results.

---

## R-6: Installation Path

Users should install with:
```bash
npm install -g @<scope>/orch-cli
orch init            # one-time global setup, creates ~/.orch/
cd /path/to/myproject
orch attach .        # adds .orch/profile.yaml to this project
orch start           # daemon runs
```

No manual git clone, no build steps, no custom npm scripts.

For development (contributor):
```bash
git clone <repo>
pnpm install
pnpm run dev         # runs daemon locally in watch mode
```

---

## R-7: Docker Compose for Full Stack

`docker-compose.yml` at repo root spins up:
- `orch-core` (the daemon)
- `langfuse` OR `signoz` (pick one, default Langfuse)
- `postgres` (for Langfuse, if chosen)

Users who prefer docker run:
```bash
docker compose up -d
```

Single-command stack. No manual OTEL collector YAML editing.

---

## R-8: Breaking Changes Require Major Version

Profile schema, hook contract, HTTP API: bump major version on breaking change.

Migration path:
- `orch migrate` command
- Codemod in `packages/cli/src/migrations/`
- Changelog entry

Don't silently break someone's `.orch/profile.yaml` on upgrade.

---

## R-9: Team Share Path

To share with a friend/colleague:
1. They install Orch: `npm install -g @<scope>/orch-cli`
2. They attach their project: `orch attach /path/to/their/project`
3. They edit `.orch/profile.yaml` with their ccs profiles, their Telegram chat ID
4. They run `orch start`

No contact with your machine, no shared state, no sync needed.

If they want team-level dashboards: future phase (not v1).

---

## R-10: No Personal Branding in Core

Files in `packages/` must not contain:
- Your name
- Your email (except possibly in root `package.json` author field)
- Your GitHub handle (in code, not in commit history)
- Your StockForge project specifically

Examples folder is fine: `examples/stockforge-integration/` is a sample.

---

## R-11: Documentation as First-Class

Every module has a `README.md` explaining:
- What it does (1 sentence)
- Public API (service methods with brief descriptions)
- Events it emits and listens to
- Dependencies (NestJS modules it imports)

Root `README.md` has:
- What Orch is (1 paragraph)
- Quick start (5 commands)
- Link to `docs/`
- License

---

## R-12: License Clarity

- Repo license: MIT (default) or Apache 2.0 (if preferred)
- Third-party code attribution in `NOTICE.md` or inline
- Claude Code hooks system: Anthropic's, used per their terms
- `ccs`: MIT (confirmed), used as CLI dependency only

Never include GPL-only code in core. Check deps:
```bash
pnpm licenses list
```

---

## R-13: Plugin/Extension Path (Future-Proof but Not Built Yet)

v1: No plugin system. Core provides the features. (YAGNI per charter.)

v2+: If plugin system becomes necessary, it will be:
- `@orch/plugin-<name>` npm packages
- Loaded dynamically from profile: `plugins: [{ name: "custom", package: "@user/my-plugin" }]`
- Plugins implement a narrow interface

**Do NOT build this in v1.** Just name public interfaces cleanly so v2 can add plugins without refactoring.

---

## R-14: Upgrade Path Preservation

When Orch upgrades (e.g., Claude Code hooks API changes):
- `profile.yaml` schema stays backward-compatible within major version
- Hook endpoint paths don't change within major version
- Database migrations are automatic and reversible

Test matrix in CI must include "old profile + new daemon" scenario.

---

## Verification Checklist

Run these before any release:

- [ ] Fresh user on fresh machine: can install and `orch init` in < 5 min
- [ ] No hardcoded paths: `grep -rn "/home/\|/Users/" packages/` empty
- [ ] No personal refs: `grep -rn "stockforge" packages/core/` empty
- [ ] Docker compose works: `docker compose up` produces usable stack
- [ ] Cross-platform: test on Linux + macOS (Windows WSL2 if time)
- [ ] Sample integration in `examples/stockforge-integration/` is complete and runnable
- [ ] Docs cover install, configure, operate, troubleshoot
