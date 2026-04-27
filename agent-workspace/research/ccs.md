# Research Note: ccs (Claude Code Switch)

**Repo**: https://github.com/kaitranntt/ccs
**Version studied**: 7.74.0 (as of 2026-04-24)
**Clone path**: reference-repos/ccs/
**Tier**: C - dependency surface only. We invoke it, we do not copy it.
**License**: MIT
**Date**: 2026-04-24
**Budget used**: ~8K tokens

---

## What This Repo Is

CCS is a multi-provider profile and runtime manager that sits between the user (or an orchestrator like orch) and the target CLI (claude, droid, codex). It handles credential isolation per account via CLAUDE_CONFIG_DIR, CLAUDECODE env stripping (nested session guard bypass), account-level symlinked shared context, and CLIProxy pool management for OAuth-backed providers.

Orch invokes  for every session spawn. This note documents the CLI surface and failure modes relevant to orch.

---

## CLI Surface Orch Depends On

### Primary Spawn Pattern

Confirmed commands:

    ccs <profile> --print "prompt here"        # headless non-interactive spawn
    ccs <profile> --resume <sessionId>            # same-account reconnect only
    ccs auth list --json                          # enumerate available profiles (machine-readable)

The --json flag on [X] Unknown command: list
Run for help:
  ccs auth --help is confirmed in source (src/auth/commands/list-command.ts:19). JSON output shape:

- version: string (ccs version)
- profiles: array of { name, type, is_default, created, last_used, context_mode, context_group, continuity_mode, instance_path }

This is the charter-compliant way to enumerate accounts without reading ~/.ccs/ directly (I-5).

### Session Management Commands

| Command | Use in orch |
|---|---|
| ccs <profile> --print "prompt" | Headless non-interactive spawn |
| ccs <profile> --resume <id> | Same-account reconnect after interrupt |
| ccs auth list --json | Enumerate profiles for failover pool |
| ccs cliproxy status | Check which CLIProxy accounts are paused |
| ccs doctor | Health check during orch startup |

### CLAUDECODE Env Stripping

CCS automatically strips CLAUDECODE before invoking claude. Confirmed at src/utils/shell-executor.ts:116-124. The strip is case-insensitive (for Windows where env keys are case-insensitive).

Applied at: execClaude() and headless-executor.ts paths. Orch does NOT need to handle this when invoking via ccs. If orch ever bypasses ccs and calls claude directly, it must strip CLAUDECODE itself using a case-insensitive key comparison.

### CLAUDE_CONFIG_DIR Handling

CCS sets CLAUDE_CONFIG_DIR=~/.ccs/instances/<profile>/ for account profiles. Orch must never set this env var itself. The only orch-side concern: do not inherit a CLAUDE_CONFIG_DIR from the parent process when spawning ccs.

---

## Exit Code Behavior

CCS defines exit codes in src/errors/exit-codes.ts:

| Code | Meaning | Orch action |
|---|---|---|
| 0 | Success | Normal completion |
| 1 | General error | Log, possibly retry |
| 2 | Config error | Alert, do not retry |
| 3 | Network error | Retry after backoff |
| 4 | Auth error | Flag account unhealthy |
| 5 | Binary error (claude not found) | STOP, alert operator |
| 6 | Provider error (rate limit, quota) | Failover to next account |
| 7 | Profile not found | Alert, do not retry |
| 8 | Proxy error | Alert |
| 130 | User abort / SIGINT | Treat as user-cancelled |

Exit codes 3 (NETWORK_ERROR) and 6 (PROVIDER_ERROR) are marked recoverable in isRecoverable().

**Exit code pass-through**: CCS propagates claude's exit code unchanged via wireChildProcessSignals -> defaultExitHandler (src/utils/signal-forwarder.ts:40). If claude exits with a signal, process re-raises that signal. If claude exits normally, process.exit(code || 0). Orch sees the raw claude exit code when claude exits, and CCS's own exit code only for pre-launch failures (profile not found, binary not found, etc.).

**Distinguishing rate-limit vs user-exit**: Cannot rely on exit code alone. Must combine:
1. Exit code (6 from ccs = provider error, which includes rate limit)
2. Stderr pattern: scan for "rate limit", "quota", "overloaded"
3. Claude hooks: SessionEnd with reason field (if hooks are wired in managed project)

---

## Cross-Account Resume

Full analysis in agent-workspace/research/verification/ccs-resume.md. Summary:

Cross-account --resume is NOT supported. Resume follows CLAUDE_CONFIG_DIR, which is account-scoped. ccs <work> --resume <id> only works if that session-id belongs to the work lane.

Same-account reconnect is viable: store last sessionId from hooks, respawn with ccs <sameAccount> --resume <sessionId> if account still has quota.

---

## CLIProxy Quota Failover: What Orch Gets For Free

CCS's CLIProxy pool auto-manages:
- Auto-pauses accounts when quota exhausted
- Auto-resumes after cooldown
- Never auto-pauses last available account

What orch must still handle:
- Detect that a claude subprocess exited with error (CLIProxy failover is HTTP-layer only; orch sees subprocess exits)
- Decide to spawn fresh session on next account
- Build handoff prompt (Phase 3 feature)

---

## Programmatic Account Enumeration (Without Reading ~/.ccs/)

Charter I-5 prohibits direct filesystem reads of ~/.ccs/. Safe path:

    ccs auth list --json

Returns profiles with instance_path, context_mode, is_default. Orch should call at startup and on each failover decision.

Note: --json flag for ccs cliproxy status is NOT confirmed in source. May need to parse human-readable output or use a separate check. Phase 1 verification item.

---

## Findings Summary

### LEARN (understand, implement differently)

1. CLAUDECODE stripping: case-insensitive key comparison required on Windows. If orch ever calls claude directly (not via ccs), apply this pattern.

2. Exit code taxonomy: CCS ExitCode enum is the right model for orch's worker process manager. Code 6 = recoverable provider error = trigger failover.

3. Signal propagation: wireChildProcessSignals pattern (forward SIGINT/SIGTERM/SIGHUP, clean up on child exit, re-raise signal vs exit with code) is the right model for orch's process manager.

### SKIP

1. Dashboard/Express/WebSocket layer: orch has its own UI.
2. Droid/Codex adapters: orch targets Claude only.
3. CLIProxy OAuth token management: entirely owned by ccs.
4. Analytics/logging internals: orch has its own OTEL pipeline.

### CONCERNS

1. ccs cliproxy status has no confirmed --json flag. Phase 1 must verify how to programmatically detect paused accounts.

2. Exit code 6 vs raw claude exit code for rate-limit: CCS exits 6 for pre-spawn detection, but passes raw claude exit code when claude itself errors mid-session. Claude's own rate-limit exit code is not necessarily 6. Orch must scan stderr, not rely on exit code alone.

3. Headless Windows behavior with --print flag: Phase 1 integration test required.

---

## License

MIT. No compatibility concerns.

---

## Cross-References

- agent-workspace/research/verification/ccs-resume.md - full cross-account resume analysis
- agent-workspace/constitution/invariants.md I-5 - never read ~/.ccs/ directly
