# Apply Orch to Your Own Project

> **Audience**: a dev who has read [README.md](./README.md) and decided they
> want Orch driving Claude Code work on *their* codebase. This guide is the
> 10-step migration path. Total effort: ~1 day, mostly config.

---

## What this guide is NOT

- It is not a fork-the-whole-repo recipe. You should NOT copy `agent-workspace/`,
  `tasks/`, or `specs/` from this repo — those are the orch-starter's *own*
  development artifacts, not Orch's runtime.
- It is not a turnkey CI integration. Orch is for interactive autonomous
  sessions, not headless pipelines.
- It is not a fork of Claude Code itself. Orch wraps `claude --rc`; it does
  not replace it.

## What you reuse vs. what you write fresh

| Reuse from this repo | Write fresh in your project |
|---|---|
| `packages/core/` (daemon — NestJS, adapters, tracing, sessions) | `.orch/profile.yaml` (project-specific config) |
| `packages/telegram/` (Grammy bridge — optional) | `.claude/agents/*.md` (your subagents — copy templates from here) |
| `packages/web-ui/` (optional) | `.claude/skills/*/SKILL.md` (your skills — copy patterns from here) |
| `scripts/hooks/*` (budget watchdog, dispatch recorder, telemetry) | `.claude/commands/*.md` (your slash commands) |
| `scripts/dogfood/run-self-task.ts` (the dogfood harness) | `CLAUDE.md` (your project rules — model on this repo's, then trim) |
| `.claude/hooks/profiles/{minimal,standard,strict}.md` | A `tasks/` directory IF you want autonomous-mode artifacts |

**Rule**: anything under `packages/core/` is project-agnostic. Anything under
`agent-workspace/` is orch-starter's own work product — leave it behind. The
boundary is the line between "Orch the daemon" and "this specific project's
artifacts".

---

## The 10-step recipe

### Step 1. Decide the integration model

Pick one:

- **Sidecar mode** (recommended for first try): clone orch-starter, point its
  daemon at your project via `.orch/profile.yaml`. Your project has zero Orch
  code in it; it just has a `.claude/` directory and the orch-starter clone
  watches it. Smallest blast radius if Orch dies.
- **Submodule mode**: vendor `packages/core/` into your project as a git
  submodule. Higher coupling; useful if you want Orch's CI/test infra on your
  CI/test infra.
- **Embedded mode**: copy `packages/core/` into your monorepo. Highest coupling.
  Avoid unless you have a specific reason.

This guide assumes **sidecar mode**.

### Step 2. Verify prerequisites

Your machine needs:

- **Node 20+** with pnpm
- **`claude` CLI** (Anthropic's Claude Code) on PATH — verify with `claude --version`
- **`ccs` CLI** (Claude Code Switch) on PATH IF you want multi-account failover —
  verify with `ccs --version`. Skip if you only have one Anthropic subscription
  account; see Step 5 for `ORCH_RUNTIME_MODE=subscription`
- **Git** (for worktree isolation)
- **(Optional) Telegram Bot Token + Chat ID** if you want phone notifications

See [DAY_1_CHECKLIST.md](./DAY_1_CHECKLIST.md) for OS-specific install steps.

### Step 3. Clone orch-starter as a sidecar

```bash
mkdir -p ~/orch-sidecars
cd ~/orch-sidecars
git clone <orch-starter-repo-url> orch-for-myproject
cd orch-for-myproject
pnpm install
pnpm build
pnpm test            # baseline — should pass
```

If `pnpm test` has pre-existing regressions in `tests/hooks/`, that's a known
v2.7 carryforward — it does not block your use of Orch. See
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) §pre-existing-hook-test-failures.

### Step 4. Author your project's `.orch/profile.yaml`

In **your project root** (not the sidecar), create:

```yaml
# my-project/.orch/profile.yaml
schema_version: "1"

project:
  name: my-project
  root: /absolute/path/to/my-project
  default_branch: main

runtime:
  mode: subscription                # "subscription" = direct claude --rc
                                    # "ccs" = multi-account via ccs delegation
  default_session_name: my-project  # used as the --rc <name> argument
  worktree_isolation: per-dispatch  # "per-dispatch" | "shared" | "off"

dispatch:
  default_subagent: task-implementer
  default_model: sonnet
  default_effort: medium
  budget_cap_tokens: 60000          # per-dispatch hard cap

hooks:
  profile: standard                 # minimal | standard | strict
  custom_dir: .claude/hooks         # relative to project root, OPTIONAL

tracing:
  exporter: console                 # console | otlp | langfuse
  otlp_endpoint: ""                 # required if exporter=otlp
  langfuse:                         # required if exporter=langfuse
    public_key: ""
    secret_key: ""

telegram:                           # optional; remove block to disable
  bot_token_env: TG_BOT_TOKEN
  chat_id_env: TG_CHAT_ID
```

See [configuration.md](./configuration.md) for the full field reference.

### Step 5. Choose runtime mode

The big question: do you have **one Anthropic subscription** or **multiple
accounts to failover between**?

- **One subscription** → set `runtime.mode: subscription` in profile.yaml,
  AND set `ORCH_RUNTIME_MODE=subscription` in your shell. Orch will spawn
  `claude --rc <name>` directly using your `~/.claude/` credentials. No ccs
  delegation profile needed.
- **Multiple accounts** → set `runtime.mode: ccs`, then run `ccs api create
  <profile-name> --preset anthropic --api-key <key>` for each account. See
  [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) §ccs-delegation-not-configured for
  the gotchas.

### Step 6. Author your project's CLAUDE.md

Copy `CLAUDE.md` from the sidecar to your project root, then trim:

- Keep: Identity (rename), Core Principles (P1-P4), Subagents table (trim to
  the ones you'll actually use), Session Protocol, Common Anti-Patterns
- Remove: orch-starter–specific phase plans, autonomous-protocol references
  to Phase 0..4, the dogfood harness section if you don't plan to dogfood
- Adapt: hard rules section to your project's actual invariants (e.g., your
  ORM, your domain layer, your no-go list)

Target length: ≤ 2500 tokens (the file is loaded into every Claude Code
session — keep it lean).

### Step 7. Author your subagents

In `my-project/.claude/agents/`, drop one markdown file per subagent role.
Templates to copy from this sidecar:

- `master-planner.md` — phase decomposition (keep if you'll do multi-phase work)
- `sandwich-architect.md` — session-level task breakdown
- `task-implementer.md` — one-task-per-subagent execution
- `spec-compliance-reviewer.md` — Part-B contract checking
- `code-quality-reviewer.md` — invariant + test quality
- `sandwich-verifier.md` — adversarial whole-session review
- `systematic-debugger.md` — 4-phase evidence-driven debugging
- `research-scanner.md` — study one reference repo per invocation

Keep the YAML frontmatter (Claude Code reads `description` to choose the
agent). Rewrite the body to match YOUR project's conventions, NOT
orch-starter's. Common mistake: leaving "this is the Orch project" language
in the agent prompt. The agent will get confused.

### Step 8. Author your skills + slash commands

Skills (`my-project/.claude/skills/<name>/SKILL.md`) are auto-loaded behavior
modifiers. Copy patterns from this repo's `.claude/skills/` but rewrite for
your domain. Highest-value skills to copy:

- `verification-before-completion` — universal
- `confusion-protocol` — universal
- `research-first` — universal
- `subagent-driven-development` — universal IF you'll do multi-task sessions

Slash commands (`.claude/commands/<name>.md`) are user-invoked entry points.
The `/effort` and `/loop` commands from this repo are universal; project-
specific ones (like `/phase-advance`) you'll author for your own workflow.

### Step 9. Wire hooks

Choose a hook profile in profile.yaml: `minimal | standard | strict`. Each is
documented in `.claude/hooks/profiles/<name>.md` in this repo.

If you want custom hooks beyond the profiles:

```jsonc
// my-project/.claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/my-bash-audit.sh" }] }
    ]
  }
}
```

**Hard rule**: every hook command must use `${CLAUDE_PROJECT_DIR:-.}` as its
prefix. Relative paths break under spawned subagent cwds. See
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) §hook-not-firing.

### Step 10. First dispatch

From the sidecar:

```bash
cd ~/orch-sidecars/orch-for-myproject

# point at your project
export ORCH_PROJECT_PATH=/absolute/path/to/my-project
export ORCH_RUNTIME_MODE=subscription

# start the daemon (or invoke a one-shot dogfood task)
pnpm dev:daemon
# OR
ORCH_DOGFOOD_EXECUTE=true npx tsx scripts/dogfood/run-self-task.ts \
  --envelope my-project/.orch/queue/my-first-task.yaml
```

If the dogfood harness fires and the spawned subprocess actually executes a
task and writes back a result, you're done. If not, check
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) §dogfood-spawn-fails.

---

## What NOT to change

These are load-bearing — touching them breaks the project-agnostic contract:

- **`packages/core/src/domain/`** — pure TypeScript domain layer. Zero NestJS
  imports. Adding a NestJS import here breaks the layered architecture.
- **`IAgentRuntime` interface** — adding methods here forces every adapter
  (ClaudeCodeAdapter, CodexAdapter, ...) to implement them. Extend via
  composition, not interface widening.
- **One-way dependency**: `packages/core/` MUST NOT import from your project.
  Your project does not have Orch code; the sidecar reads your project. If
  you find yourself wanting to `import './my-project/...'` from core, stop —
  you're inverting the dependency.
- **Credentials**: Orch never reads `~/.claude/` or `~/.ccs/` files. Only
  invokes the CLIs. Don't add credential-reading code; it breaks the
  machine-local rule and is a security liability.

---

## After Step 10 — what next

- **Add Telegram**: drop your bot token + chat ID into env, set
  `telegram.bot_token_env` in profile.yaml, run `pnpm dev:telegram`.
- **Add Web UI**: `pnpm dev:web-ui` opens an observability panel showing
  active sessions + recent traces.
- **Add OTLP tracing**: point `tracing.otlp_endpoint` at your collector
  (Langfuse, SigNoz, Honeycomb). Spans emit per dispatch.
- **Tune budget thresholds**: `ORCH_WIND_DOWN_TOKENS` (default 200000) and
  `ORCH_CLIFF_TOKENS` (default 230000) can be set to whatever your account's
  actual context limit is.
- **Customize phase plans**: if you do multi-phase autonomous work, model
  yours on `agent-workspace/session-plans/pending/phase-12-v2.7-self-application-priority.md`
  — but write your own; this repo's are domain-specific.

---

## Common gotchas

1. **Don't copy `agent-workspace/`** — it's this project's *internal*
   bookkeeping (decisions, observations, sessions, checkpoints). Your project
   has its own equivalent if you choose to do autonomous work; don't mix.
2. **Don't copy `tasks/feat_*` or `specs/`** — same reason. They are
   orch-starter's own dev queue.
3. **Don't run `pnpm dev:daemon` AND `claude --rc` against the same project
   simultaneously without coordination** — both will try to spawn into the
   same session name and you'll get conflicting RC sessions. Use `--rc` names
   that include the project + role: `--rc myproject-orch-daemon` vs
   `--rc myproject-interactive`.
4. **The dogfood harness spawns `claude --rc`, not the other way around** —
   if you're already inside a `claude --rc` session and you fire dogfood, you
   get nested RC sessions. That works mechanically but the trace
   telemetry will conflate parent + child events. Run the daemon outside any
   active Claude Code session for cleanest tracing.

---

## Where to ask for help

- Search this `docs/` tree first
- Read `agent-workspace/constitution/` if you want the *why* behind a rule
- File issues against the orch-starter repo with a minimal reproduction
- The internal `agent-workspace/memory/decisions/` directory captures every
  binding decision; if a behavior surprises you, search there for "Decision
  NNN — <slug>"
