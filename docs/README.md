# Orch — Documentation Bundle

> **Audience**: a working software engineer who wants to install, configure,
> and apply Orch to their own project. Not Orch contributors; not internal
> protocol readers. Read these in order.

---

## What is Orch?

Orch is a personal **Claude Code orchestration daemon**. It sits between a
human operator (Telegram, Web UI, or CLI) and one or more Claude Code sessions
running on managed projects. It handles:

- **Session lifecycle**: spawn / resume / terminate `claude --rc` subprocesses
- **Rate-limit failover**: when one account hits quota, route to the next
- **Context handoff**: at 200K tokens, checkpoint state and self-reboot
- **Tracing + telemetry**: OpenTelemetry spans for every dispatch
- **Hooks**: SessionStart / PostToolUse / Stop integration

Orch is a **dumb scheduler with a smart interface**. It does not replace
Claude Code's intelligence — it makes Claude Code's intelligence durable
across long-running, multi-session work.

## Is Orch right for me?

**Yes** if you want:

- Long autonomous runs (>30 min) without manual hand-holding
- Multiple Claude Code sessions running against the same repo with shared state
- Telegram or web-app interface to monitor / steer work from your phone
- Trace + budget data for every dispatch, not just final output

**No / not yet** if you want:

- A Claude Agent SDK alternative — Orch deliberately uses CLI subprocesses
  for subscription accounts (Anthropic ToS April 2026); SDK is not supported
- A turnkey CI bot — Orch is for development sessions, not unattended pipelines
- A managed hosted service — this is a self-hosted daemon

## Architecture (10-second tour)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│  Telegram    │    │   Web UI     │    │   Direct CLI     │
│  (Grammy)    │    │ (React+Vite) │    │  (claude --rc)   │
└──────┬───────┘    └──────┬───────┘    └────────┬─────────┘
       │                   │                     │
       └─────────┬─────────┴─────────────────────┘
                 │
        ┌────────▼─────────┐
        │  Orch daemon     │   stateless dispatch logic + Prisma+SQLite
        │  (NestJS,        │   Bull-style queue, no LLM calls
        │   packages/core) │
        └────────┬─────────┘
                 │
                 │  IAgentRuntime.spawn()
                 │
        ┌────────▼─────────┐
        │ ClaudeCodeAdapter│   execa('ccs', ...) | execa('claude', ['--rc',...])
        └────────┬─────────┘
                 │
        ┌────────▼─────────┐
        │  claude --rc     │   one process per managed-project session
        │  subprocesses    │   stream-json stdout → trace pipeline
        └──────────────────┘
```

The **daemon never calls an LLM**. LLM reasoning happens only inside spawned
`claude --rc` subprocesses. This is intentional — it keeps state-machine
transitions deterministic, doubles as a cost barrier (no surprise tokens
inside the queue logic), and makes failure modes legible.

## Documentation index

Read in this order:

1. **[install.md](./install.md)** *(non-existent — see [DAY_1_CHECKLIST.md](./DAY_1_CHECKLIST.md) for now)* — prerequisites + first-run sanity checks
2. **[quickstart.md](./quickstart.md)** — zero-to-running-daemon walkthrough
3. **[architecture.md](./architecture.md)** — module boundaries + adapter pattern
4. **[configuration.md](./configuration.md)** — full `.orch/profile.yaml` reference + env vars
5. **[WORKFLOW.md](./WORKFLOW.md)** — how a single session flows from start to end
6. **[apply-to-your-project.md](./apply-to-your-project.md)** — *the migration guide* — adapt Orch to your codebase in 10 steps
7. **[SLASH_COMMANDS.md](./SLASH_COMMANDS.md)** — `.claude/commands/` reference
8. **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** — errors + fixes (ccs delegation, hooks, stash incidents)
9. **[release.md](./release.md)** — semver + changelog discipline (only relevant if you plan to publish)

Internal references (you usually don't need to read these — pointers only):

- [../CLAUDE.md](../CLAUDE.md) — Claude Code's project rules
- [../PROJECT_CHARTER.md](../PROJECT_CHARTER.md) — immutable invariants (I-1..I-15)
- [../agent-workspace/constitution/](../agent-workspace/constitution/) — Karpathy principles, architecture, invariants, etc.

## What's stable / what's in flight (as of v2.7)

| Capability | Status |
|---|---|
| `claude --rc` subprocess spawn via ccs | **stable** |
| Subprocess spawn via `claude` direct (ORCH_RUNTIME_MODE=subscription) | **landed v2.7** ([configuration.md](./configuration.md)) |
| Stream-json event parsing | **stable** |
| Rate-limit / context-full classification | **stable** |
| Telegram bridge (Grammy) | **stable** |
| Web UI observability panel | **stable** |
| OTLP tracing (Langfuse, SigNoz) | **stable** |
| Multi-account failover | **scaffolded; auto-failover policy gated on SC-39** |
| Self-application (Orch dispatching its own work via dogfood harness) | **mechanically working; full E2E gated on ccs delegation profile config OR ORCH_RUNTIME_MODE=subscription** |
| Hook profiles (minimal/standard/strict) | **stable** |
| Worktree isolation per dispatch | **stable** |

A capability listed as "scaffolded" or "gated" means the code path exists but
the operational dependency isn't always satisfied out of the box. See
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for the specific gaps.

## Quick links

- **First time?** Start with [DAY_1_CHECKLIST.md](./DAY_1_CHECKLIST.md)
- **Already running, want to add a project?** Jump to [apply-to-your-project.md](./apply-to-your-project.md)
- **Hit an error?** Search [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Customizing slash commands?** See [SLASH_COMMANDS.md](./SLASH_COMMANDS.md) and `.claude/commands/`
- **Want to understand a subagent's prompt?** Read `.claude/agents/<name>.md`

## License + status

This is research-grade software. Treat it as something you fork and adapt,
not a product you depend on. The internal `agent-workspace/` directory is
opinionated; you may want to keep your own. The `packages/core/` daemon is
project-agnostic by design — that's the part to reuse.
