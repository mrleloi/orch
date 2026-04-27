/**
 * GitDiffCollector — L0 git diff stat wrapper.
 *
 * Runs `git -C <repoPath> diff --stat <fromRef>..<toRef>` via an injected
 * execa function. Never throws on non-zero exit; returns a degraded summary.
 *
 * Decision 006 enforcement:
 *  - Binary parameter is the literal 'git' (hard-coded, not user-supplied).
 *  - No network I/O. No LLM calls. No Anthropic SDK import.
 *
 * I-12: Zero `any` in this file.
 * I-1: No LLM or Anthropic SDK imports.
 */

import { Injectable, Inject } from '@nestjs/common';
import type {
  GitDiffSummary,
  FileDiffRecord,
  ExecaFn,
  ILogger,
} from './types.js';
import { EXECA_TOKEN, LOGGER_TOKEN } from './types.js';
import { DomainError } from '../../domain/errors.js';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Hard timeout for the git subprocess (ms). */
const GIT_TIMEOUT_MS = 5000;

/**
 * Matches a standard `git diff --stat` file line:
 *   " src/foo.ts | 12 ++++----"
 * Groups: (1) path, (2) total changes
 */
const FILE_STAT_REGEX = /^\s+(.+?)\s+\|\s+(\d+)\s+[+-]+\s*$/;

/**
 * Matches a binary-file line from `git diff --stat`:
 *   " src/img.png | Bin 0 -> 1024 bytes"
 */
const BINARY_FILE_REGEX =
  /^\s+(.+?)\s+\|\s+Bin\s+(\d+)\s+->\s+(\d+)\s+bytes\s*$/;

/**
 * Matches the summary line:
 *   " 3 files changed, 47 insertions(+), 19 deletions(-)"
 * Also handles singular: "1 file changed, 1 insertion(+)"
 */
const SUMMARY_REGEX =
  /^\s+\d+\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?\s*$/;

/**
 * Matches insertion count from a file stat line (run of '+' chars).
 * We count the '+' characters in the bar section to approximate insertions.
 */
const PLUS_MINUS_REGEX = /^\s+.+?\|\s+\d+\s+([+-]+)\s*$/;

// ── GitDiffCollector ───────────────────────────────────────────────────────────

@Injectable()
export class GitDiffCollector {
  constructor(
    @Inject(EXECA_TOKEN) private readonly execaFn: ExecaFn,
    @Inject(LOGGER_TOKEN) private readonly log: ILogger,
  ) {}

  /**
   * Runs `git -C <repoPath> diff --stat <fromRef>..<toRef>`.
   * Never throws on non-zero exit; returns degraded summary instead.
   * Hard timeout 5000ms. CWD pinned via -C; binary hard-coded "git".
   *
   * @throws Never — all errors are surfaced via `degraded: true` on the result.
   */
  async collect(
    repoPath: string,
    fromRef: string,
    toRef: string,
  ): Promise<GitDiffSummary> {
    const args: readonly string[] = [
      '-C',
      repoPath,
      'diff',
      '--stat',
      '--no-color',
      `${fromRef}..${toRef}`,
    ];

    let result: {
      stdout: string;
      stderr: string;
      exitCode: number;
      failed: boolean;
    };

    try {
      result = await this.execaFn('git', args, {
        cwd: repoPath,
        timeout: GIT_TIMEOUT_MS,
        reject: false,
      });
    } catch (err) {
      // execa throws (instead of returning) on ENOENT (binary not found) or timeout
      const msg = err instanceof Error ? err.message : String(err);
      const isEnoent =
        (err as NodeJS.ErrnoException).code === 'ENOENT' ||
        msg.includes('ENOENT') ||
        msg.includes('not found');
      const degradedReason = isEnoent
        ? 'git not available'
        : `git error: ${msg}`;

      this.log.log(`GitDiffCollector degraded (thrown): ${degradedReason}`, {
        repoPath,
        fromRef,
        toRef,
      });

      return this.degraded(fromRef, toRef, degradedReason);
    }

    // Non-zero exit or failed flag → degraded path (bad ref, permission, etc.)
    if (result.failed || result.exitCode !== 0) {
      const firstStderrLine =
        (result.stderr ?? '').split('\n')[0]?.trim() ?? '';
      const degradedReason =
        firstStderrLine !== ''
          ? firstStderrLine
          : `git exited with code ${result.exitCode}`;

      this.log.log(
        `GitDiffCollector degraded (non-zero exit): ${degradedReason}`,
        {
          repoPath,
          fromRef,
          toRef,
          exitCode: result.exitCode,
        },
      );

      return this.degraded(fromRef, toRef, degradedReason);
    }

    // Happy path: parse stdout
    return this.parse(repoPath, fromRef, toRef, result.stdout);
  }

  /**
   * Runs `git -C <repoPath> rev-parse HEAD` and returns the 40-char hex SHA.
   *
   * @param repoPath  Absolute path to the git repository root.
   * @returns         40-char lowercase hex commit SHA.
   * @throws          DomainError('GIT_HEAD_RESOLVE_FAILED') if the path is not a git
   *                  repository, git is not on PATH, or the output is not a valid SHA.
   */
  async getHeadCommit(repoPath: string): Promise<string> {
    const args: readonly string[] = ['-C', repoPath, 'rev-parse', 'HEAD'];

    let result: {
      stdout: string;
      stderr: string;
      exitCode: number;
      failed: boolean;
    };

    try {
      result = await this.execaFn('git', args, {
        cwd: repoPath,
        timeout: GIT_TIMEOUT_MS,
        reject: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error('GitDiffCollector.getHeadCommit: execa threw', {
        repoPath,
        error: msg,
      });
      throw new DomainError(
        'GIT_HEAD_RESOLVE_FAILED',
        `git rev-parse HEAD threw in "${repoPath}": ${msg}`,
        { cause: err },
      );
    }

    if (result.failed || result.exitCode !== 0) {
      const stderr = (result.stderr ?? '').split('\n')[0]?.trim() ?? '';
      const reason = stderr !== '' ? stderr : `exit code ${result.exitCode}`;
      this.log.error('GitDiffCollector.getHeadCommit: non-zero exit', {
        repoPath,
        reason,
      });
      throw new DomainError(
        'GIT_HEAD_RESOLVE_FAILED',
        `git rev-parse HEAD failed in "${repoPath}": ${reason}`,
      );
    }

    const sha = result.stdout.trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      this.log.error('GitDiffCollector.getHeadCommit: unexpected output', {
        repoPath,
        sha,
      });
      throw new DomainError(
        'GIT_HEAD_RESOLVE_FAILED',
        `git rev-parse HEAD returned unexpected output in "${repoPath}": "${sha}"`,
      );
    }

    return sha.toLowerCase();
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private parse(
    _repoPath: string,
    fromRef: string,
    toRef: string,
    stdout: string,
  ): GitDiffSummary {
    // Strip Windows CRLF before parsing (Risk R-B)
    const normalised = stdout.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalised.split('\n');

    const files: FileDiffRecord[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;
    let summaryFound = false;

    for (const line of lines) {
      if (line.trim() === '') continue;

      // Try summary line first (ends with "files changed, ...")
      const summaryMatch = SUMMARY_REGEX.exec(line);
      if (summaryMatch) {
        summaryFound = true;
        totalInsertions =
          summaryMatch[1] !== undefined ? parseInt(summaryMatch[1], 10) : 0;
        totalDeletions =
          summaryMatch[2] !== undefined ? parseInt(summaryMatch[2], 10) : 0;
        continue;
      }

      // Try binary file line
      const binaryMatch = BINARY_FILE_REGEX.exec(line);
      if (binaryMatch) {
        const binaryPath = binaryMatch[1];
        if (binaryPath !== undefined) {
          files.push({
            path: binaryPath.trim(),
            insertions: 0,
            deletions: 0,
            binary: true,
          });
        }
        continue;
      }

      // Try standard file stat line
      const fileMatch = FILE_STAT_REGEX.exec(line);
      if (fileMatch) {
        const filePath = fileMatch[1];
        const totalChangedStr = fileMatch[2];
        if (filePath === undefined || totalChangedStr === undefined) continue;
        const path = filePath.trim();
        const totalChanged = parseInt(totalChangedStr, 10);

        // Count '+' and '-' characters in the bar to estimate insertions/deletions
        const barMatch = PLUS_MINUS_REGEX.exec(line);
        let insertions = 0;
        let deletions = 0;

        if (barMatch) {
          const bar = barMatch[1] ?? '';
          for (const ch of bar) {
            if (ch === '+') insertions++;
            else if (ch === '-') deletions++;
          }
          // Scale to actual total if bar is truncated (git truncates for wide diffs)
          if (
            insertions + deletions < totalChanged &&
            insertions + deletions > 0
          ) {
            const ratio = totalChanged / (insertions + deletions);
            insertions = Math.round(insertions * ratio);
            deletions = Math.round(deletions * ratio);
          } else if (insertions + deletions === 0) {
            // Only insertions or only deletions — total is one side
            insertions = totalChanged;
          }
        } else {
          insertions = totalChanged;
        }

        files.push({ path, insertions, deletions, binary: false });
        continue;
      }

      // Malformed / unrecognised line — skip silently (resilience requirement)
    }

    // If no summary line, sum from files (or zero for empty diff)
    if (!summaryFound) {
      totalInsertions = files.reduce((acc, f) => acc + f.insertions, 0);
      totalDeletions = files.reduce((acc, f) => acc + f.deletions, 0);
    }

    return {
      fromRef,
      toRef,
      files,
      totalInsertions,
      totalDeletions,
      degraded: false,
    };
  }

  private degraded(
    fromRef: string,
    toRef: string,
    degradedReason: string,
  ): GitDiffSummary {
    return {
      fromRef,
      toRef,
      files: [],
      totalInsertions: 0,
      totalDeletions: 0,
      degraded: true,
      degradedReason,
    };
  }
}
