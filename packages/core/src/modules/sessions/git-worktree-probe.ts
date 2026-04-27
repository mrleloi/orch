/**
 * git-worktree-probe.ts — Cross-platform probe for `git worktree` availability.
 *
 * Decision 018 (master plan §8 risk-register row 2): On Windows hosts running
 * minimal Git Bash without the full toolchain, `git worktree add` may fail at
 * runtime. This module detects the capability once per daemon process and lets
 * the adapter degrade to non-isolated spawn rather than throwing at spawn time.
 *
 * Usage: call `probeWorktreeSupport()` once; cache the result on the adapter
 * instance (lazy-once pattern in ClaudeCodeAdapter.createWorktreeIfNeeded).
 *
 * I-3: git is invoked via execa — never via bash -c shell interpolation.
 */

import execa from 'execa';

/** Result returned by {@link probeWorktreeSupport}. */
export interface WorktreeProbeResult {
  supported: boolean;
  /** Human-readable reason when supported=false (absent when supported=true). */
  reason?: string;
}

/**
 * Probe whether `git worktree` is available and functional on the current host.
 *
 * Runs `git worktree add --help` (git >= 2.5; help subcommand is cross-platform).
 * Any non-error exit (0) is treated as success regardless of stdout content —
 * help output format varies across git versions and platforms.
 *
 * Returns `{ supported: false, reason }` on:
 *   - ENOENT (git not on PATH)
 *   - non-zero exit code
 *
 * Decision 018 + master plan §8 risk-register row 2.
 *
 * @returns Promise resolving to a {@link WorktreeProbeResult}.
 */
export async function probeWorktreeSupport(): Promise<WorktreeProbeResult> {
  let result: { exitCode: number | null | undefined; stderr: string };
  try {
    result = await execa('git', ['worktree', 'add', '--help'], {
      reject: false,
      all: false,
    });
  } catch (err) {
    // Synchronous throw — ENOENT (git not on PATH) or other pre-spawn error.
    const reason = err instanceof Error ? err.message : String(err);
    return { supported: false, reason };
  }

  if (result.exitCode !== 0) {
    return {
      supported: false,
      reason:
        result.stderr ||
        `git worktree add --help exited with code ${String(result.exitCode ?? '?')}`,
    };
  }

  return { supported: true };
}
