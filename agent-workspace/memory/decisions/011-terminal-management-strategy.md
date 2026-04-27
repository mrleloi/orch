---
id: 011
title: Terminal Management Strategy — Direct SendKeys Is Not the Path Forward
status: open (architectural backlog for v2.x master plan)
created: 2026-04-27
phase_origin: 5 (self-evolution)
authors: [user, opus 4.7 main session #29]
---

# Decision 011 — Terminal Management Strategy

## Problem

Orch v1.0 manages the host Claude Code (`ccs`) terminal session via Windows
keystroke injection (`[System.Windows.Forms.SendKeys]::SendWait` from PowerShell,
invoked from bash hook scripts). The mechanism is used in:

- `scripts/session-self-reboot.{sh,ps1}` — fires `/new` to roll the session at
  wind-down/cliff
- `scripts/hooks/continue-injector.ps1` — fires `continue` after a fresh session
  bootstraps
- `scripts/hooks/autonomous-stop-watchdog.sh` Mode-B recovery — fires `continue`
  to recover from Anthropic API mid-stream truncation

**Observed failure modes** (2026-04-26 session #29):

1. **Detached background SendKeys fails** — `( nohup ... & ) </dev/null` severs
   interactive desktop access; SendKeys throws "Access is denied" Win32Exception.
   Fix attempted: switch to synchronous invocation. Did not solve it.
2. **Foreground race on transient SendKeys** — even synchronous, SendKeys
   throws "Access is denied" when `SetForegroundWindow` silently failed
   (Windows foreground-stealing rules). Fix attempted: copy `continue-injector`
   retry pattern, add `AttachThreadInput` bypass. Partial improvement only.
3. **Ancestor walk severed by intermediate process exit** — when invoked via
   `timeout 8 bash session-self-reboot.sh`, the `timeout` and bash subprocesses
   may exit before the PowerShell child can walk `$PID` up to the TUI ancestor.
   "No CIM record for <pid>" terminates the walk early. Fix attempted: add
   strategy-2 (walk from `Get-Process claude` filtered by session) and
   strategy-3 (any terminal in our session). Sometimes works.
4. **Single-terminal addressing** — SendKeys writes to whichever window is
   foreground at the moment of the API call. Cannot deliberately address
   "session N of M" when running multiple Claude sessions in parallel.
5. **Hard requirement on interactive desktop** — SendKeys cannot fire on a
   headless server, in a Docker container, in CI, or under a service account.
   Phase 5.3 parallelization framework + future SaaS deployment cannot use it.
6. **UIPI / elevation mismatch** — if the terminal hosting Claude is elevated
   (admin) but the hook process is not, SendKeys is blocked unconditionally.
   No retry will fix this.

## User-stated concern (2026-04-27 session #29)

> "Direct host-process management is too fragile. With one terminal it's
> already unreliable; if we want N terminals or SaaS later, this won't scale."

Confirmed correct.

## Industry alternatives

### A. tmux (Linux/macOS) + `tmux send-keys`

- Spawn each Claude session inside a named tmux window: `tmux new -d -s orch-N "ccs ..."`
- Programmatically inject input: `tmux send-keys -t orch-N "/new" Enter`
- Headless-capable, multi-session-capable, deterministic, no UIPI issues.
- **Caveat**: requires Linux/macOS. WSL2 on Windows is the bridge.
- This is what `claudegram`, `Claude-to-IM`, and most production Claude
  orchestration tools use.

### B. Containerized SDK (NOT compatible with subscription accounts)

- Run Anthropic SDK in a Docker container; Orch daemon manages container lifecycle
  via docker-py.
- **Blocked by Charter rule**: "No Agent SDK for subscription accounts" — Anthropic
  ToS (April 2026) prohibits SDK chat sending with subscription accounts. Orch
  exists specifically to use subscription accounts, so this path is not viable
  without an API-key tier customer.

### C. PTY (pseudo-terminal) wrapper

- Spawn `claude` via a real PTY (`node-pty`, `python pty`, `expect`); send input
  by writing to the master fd. Read output by reading from master fd.
- Headless-capable, multi-session, deterministic.
- **Cost**: significant rewrite of `IAgentRuntime` adapter; PTY behavior
  differs across platforms.

### D. Devcontainer / Codespaces approach

- Run `ccs` inside a devcontainer; Orch daemon manages container lifecycle.
- Communication via container exec / shared volume / network.
- Subscription-account compatible (CCS still spawns `claude` as a subprocess
  inside the container).
- **Cost**: container overhead per session; complex networking for multi-session.

### E. Web-bridge + claude.ai Remote Control

- `claude --rc` already connects sessions to claude.ai via the bridge protocol
  (researched in `claude-code-learn.md`).
- Could write a programmatic bridge client that sends `/new` and `continue`
  via the bridge instead of host SendKeys.
- **Risk**: undocumented bridge protocol; brittle to claude.ai changes.

## Recommended path for Orch v2.x

**Primary**: Plan A — **tmux on WSL2 (Windows) / native (Linux/macOS)**.

Rationale:
- Solves all six failure modes
- Compatible with subscription accounts (still uses `ccs claude` subprocess)
- Standard, debuggable, multi-session
- Same model production Claude orchestration tools use
- Single `IAgentRuntime` adapter implementation: `TmuxClaudeCodeAdapter`

**Migration plan** (sketch — to be expanded into Phase 5.3 architect doc revision):

1. **Phase 5.3** — keep current SendKeys code path as v1 fallback; add
   `TmuxClaudeCodeAdapter` as second `IAgentRuntime` implementation. Profile
   selects via `runtime_adapter: ccs-windows-sendkeys | ccs-tmux`.
2. **Phase 5.3** — `worker_mailbox` SQLite IPC (already planned) is the
   coordination primitive; tmux-based sessions write/read to the same mailbox.
3. **Phase 6** — sunset SendKeys adapter once tmux adapter is proven across all
   workflow shapes.

## Immediate-term (today, 2026-04-27)

Direct SendKeys is **best-effort, not guaranteed**. Code and operator behavior
should reflect this:

1. ✅ `session-self-reboot.ps1` (rewritten this turn) tries S1+S2+S3
   strategies, retries 4× per strategy, then writes `.auto-reboot-FAILED`
   marker for visibility.
2. ✅ Bash wrappers invoke synchronously with `timeout 8` (so failure surfaces
   within 8s; doesn't silently leak background processes).
3. ⏳ TODO Phase 5.4: SessionStart hook reads `.auto-reboot-FAILED` and
   prepends a LOUD warning to the autonomous-resume context: "Previous reboot
   failed; reset markers and dispatch carefully."
4. ⏳ TODO Phase 5.4: `/escalation-status` slash command surfaces this marker
   to the operator at any time.
5. ⏳ TODO operator practice: when running long autonomous sessions, the user
   should monitor `.auto-reboot-FAILED` (and `escalation.md` more broadly) to
   know when manual intervention is needed.

## Open questions (defer to Phase 5.3 architect)

1. WSL2 environment for tmux on Windows — does the user have WSL2 installed?
   Or do we ship instructions to install it as a v2 dependency?
2. tmux server lifecycle — single shared server vs per-project server? Dies
   with what process?
3. How does `claude --rc` interact with tmux sessions (the bridge needs the
   foreground app to be claude; tmux abstracts that)?
4. Cross-platform compatibility — macOS/Linux native vs Windows-with-WSL2.
   Unified or branched adapters?
5. How do hooks fire from a tmux-hosted claude? Same hook-receiver HTTP
   contract should still work, but per-session env-var propagation needs
   verification.

## Cross-references

- Phase 0-4 meta-retrospective `agent-workspace/memory/phase-0-4-meta-retrospective.md` §3 H-11 (~2.5h dead-time on Mode B), §3 H-25/H-26 (Mode C) — both depended on auto-reboot/recovery firing reliably
- Research note `agent-workspace/research/claude-code-learn.md` §(d) — task-claim + worker_mailbox patterns
- Research note `agent-workspace/research/claudekit-docs.md` — CCS spawn patterns
- Charter `PROJECT_CHARTER.md` — "No Agent SDK for subscription accounts"
- Phase 5 master plan `agent-workspace/session-plans/pending/phase-5-self-evolution.md` §3 Substage 5.3 — needs architecture revision to incorporate this decision
- agent-notes.md 2026-04-27 entries — both UIPI fix attempts

## Status & next action

- **Status**: open architectural backlog
- **Owner**: Phase 5.3 architect (sandwich-architect, opus) when substage 5.3
  re-architects the parallelization framework with this decision baked in
- **Trigger to act**: when Phase 5.2 closes, master-planner reads this doc
  before kicking off 5.3.1 architect dispatch
- **DO NOT close**: this is a multi-phase migration, not a single-task fix
