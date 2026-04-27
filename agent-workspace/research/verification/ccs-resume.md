# Primitive Verification — ccs + claude --resume Cross-Account

**Date**: 2026-04-24
**Source**: `reference-repos/ccs/` README + CLAUDE.md + `docs/session-sharing-technical-analysis.md` (dated 2026-04-04)
**CCS version installed locally**: 7.74.0 (`ccs --version`)
**Verification method**: Spec read of ccs internals + CLI help + architecture docs
**Live test**: NOT YET RUN (requires 2 authenticated Claude accounts; will be validated by user during Phase 1 integration)

---

## Summary (TL;DR)

**Cross-account `--resume` is NOT seamless.** Session continuity is scoped to the active `CLAUDE_CONFIG_DIR` (per-account lane). CCS provides opt-in "shared context" that links *workspace artifacts* across accounts, but **credentials remain isolated** and **resume history does not automatically carry across accounts**.

**Implication for Orch**: Treat account-switch as a session-boundary event. Spawn a NEW Claude Code session on the fallback account with a **handoff context** (summary of prior work), rather than expecting `claude --resume` to stitch sessions transparently. Charter success criterion F3 needs this refinement.

---

## How ccs Works (mental model)

```
User: ccs work <claude-args>
   ↓
ccs: set CLAUDE_CONFIG_DIR=~/.ccs/instances/work
     strip CLAUDECODE env (to bypass nested-session guard)
     exec `claude <args>` with modified env
   ↓
Claude CLI: reads its config from ~/.ccs/instances/work
             auth, sessions, transcripts all under that dir
```

- Per-account instance dir: `~/.ccs/instances/<account>/` contains `sessions/`, `todolists/`, `logs/`, `settings.json`, credentials
- Shared data (symlinked when feasible): `~/.ccs/shared/` → commands/, skills/, agents/
- Windows fallback: copies when symlinks unavailable

---

## Resume Behavior (per `session-sharing-technical-analysis.md`)

| Command | Resumes from |
|---|---|
| `ccs -r` | the lane plain `ccs` is currently using (default profile) |
| `ccs work -r` | the `work` account lane only |
| `ccs backup -r` | the `backup` account lane only |
| `claude --resume <session-id>` (no ccs) | the default `~/.claude/` dir, ignoring ccs lanes |

**Key quote** (docs line 74-80):
> Resume follows the active CLAUDE_CONFIG_DIR, not just the continuity group.
> `shared + deeper` on an account does not automatically make old plain-`ccs` resume history appear inside `ccs <account> -r`.

### Shared Context (opt-in cross-account)

```yaml
# ~/.ccs/config.yaml
accounts:
  work:
    context_mode: "shared"
    context_group: "team-alpha"
    continuity_mode: "deeper"   # optional: links session-env, file-history, shell-snapshots, todos
```

- Links *workspace* artifacts (not credentials)
- Enables visibility of prior session history files across accounts
- Does NOT guarantee `claude --resume <id>` restores full context from account A inside account B

### CLIProxy Pool (automatic quota failover)

CCS's CLIProxy pool auto-rotates across authenticated Claude accounts when one hits quota:

- `ccs cliproxy pause <account>` / `resume <account>` / `status`
- **Auto-pause** on quota exhaustion; **auto-resume** after cooldown
- **Never auto-pauses the last available account** (so single-account setups degrade gracefully)

This means: if orch spawns `claude` via `ccs cliproxy <someProfile>`, the CLIProxy layer transparently fails over the HTTP upstream when one account exhausts — but the `claude` subprocess may still exit if it sees an error before the proxy swaps. Behavior under rate-limit mid-stream is **not guaranteed** to be invisible to claude.

---

## Orch Integration Strategy (confirmed decisions)

### Strategy 1 (primary): NEW session on account switch + handoff prompt

When a session ends (for any reason — including rate-limit detected via SessionEnd reason or OTEL quota error):

1. Orch detects end
2. Orch runs **handoff builder** (Phase 3 feature): summarize last session's progress from transcript + hooks log
3. Orch spawns **new** `ccs <next-account> -p "<handoff context>"` as a fresh session
4. Treat as new session_id; link via `Session.parentSessionId` in orch DB for observability

This is charter-compliant, deterministic, and doesn't depend on Claude-hosted state.

### Strategy 2 (secondary, experimental): `ccs <account> --resume <id>` for same-account reconnect

When a session was interrupted but the same account still has quota:

1. Orch reads latest `transcript_path` from hooks payload
2. Respawns with `ccs <sameAccount> --resume <claudeSessionId>`
3. Claude Code picks up where transcript left off

This works because same-account = same `CLAUDE_CONFIG_DIR` = same session history.

### Strategy 3 (reject): cross-account `--resume` via shared context

Even with `context_mode: shared + deeper`, resume across lanes is not authoritatively supported by ccs. Docs explicitly warn it may not carry history. We reject this strategy to avoid surprise data loss.

---

## CLI Surface Orch Needs

From `ccs --help` (v7.74.0):

| Command | Use in orch |
|---|---|
| `ccs <profile> [claude-args...]` | Primary spawn mechanism. `ccs work -p "prompt"` for headless. |
| `ccs auth list` (or via `~/.ccs/config.yaml` read) | Enumerate available accounts for failover pool |
| `ccs cliproxy status` | Check which accounts are paused (quota exhausted) before spawning |
| `ccs cliproxy pause/resume <account>` | Orch does NOT call these — ccs auto-manages |
| `ccs doctor` | Health check during orch startup |
| `ccs env <profile>` | Export profile env for manual inspection (debug only) |

### Env handling rules

- **Strip `CLAUDECODE`** before spawning: ccs does this automatically when invoked. If orch bypasses ccs for some reason, orch must also strip it.
- **Never touch `~/.ccs/` or `~/.claude/` from orch code**: charter S-2 / invariant I-5. Only invoke via CLI.
- **Propagate `TRACEPARENT`**: orch sets the parent trace context; claude CLI respects standard OTEL env vars.

### Exit-code semantics (assumption, needs Phase 1 verification)

ccs returns claude CLI's exit code unchanged. Claude Code exit codes observed in practice:
- `0` = normal completion
- non-zero + stderr contains "rate limit" / "quota" = account exhausted
- non-zero + other stderr = unexpected failure

Orch should categorize exit by: exit code + stderr pattern + last SessionEnd `reason` field.

---

## Assumptions Flagged for Phase 1 Verification

| Assumption | Why it matters | How to verify |
|---|---|---|
| `ccs <profile> -p "prompt"` works headless on Windows Git Bash | primary spawn path | Phase 1 integration test with throwaway project |
| SessionEnd `reason` field distinguishes rate-limit vs user exit | drives failover decisions | Install hook, trigger rate-limit, observe payload |
| CLIProxy transparent failover keeps `claude` subprocess alive through account swap | affects whether orch sees a Fat Session or a chain of Small Sessions | Run long-running session against pool, observe |
| `ccs auth list --json` (or equivalent) exists for programmatic enumeration | orch needs to know available accounts | Check CLI; fall back to parsing `~/.ccs/config.yaml` via ccs (NOT by direct file read per I-5) |
| ccs handles concurrent invocations safely | orch may run 2+ sessions in parallel on different accounts | Phase 2 concurrency test |

---

## Verdict

**Primitive is USABLE as-is.** Charter F3 refined: not "seamless continuity" but "deterministic handoff on account-end." This aligns with Phase 3's handoff-builder feature — the thing that makes orch valuable compared to bare ccs is *exactly* this intelligent handoff, so the lack of cross-account resume is actually the justification for orch's existence.

No STOP-3 charter contradiction. Proceed.
