/**
 * SessionLogPathResolver — resolves the expected session log file path.
 *
 * Session log files follow the naming convention:
 *   <sessionsDir>/YYYY-MM-DD-session-N.md
 *
 * where:
 *   - sessionsDir  is typically `<orchHome>/memory/sessions/`
 *   - YYYY-MM-DD   is the date the session ended (ISO date portion)
 *   - N            is a per-day session sequence number (1-based)
 *
 * Determination strategy (Task 4.1):
 *  1. List all files in sessionsDir matching the date prefix for `endedAt`.
 *  2. Pick the file with the highest sequence number (latest session for that date).
 *  3. If no file matches, return the forthcoming path for N=1 (the log file does
 *     not yet exist but the path is well-defined — callers may persist the expected
 *     path and the log appears later in the same session lifecycle).
 *
 * Contract:
 *  - Always returns a string path (never null); the file may not yet exist.
 *  - The returned path is absolute.
 *  - The sessionsDir is configurable (defaults to `<ORCH_HOME>/memory/sessions/`).
 *
 * I-1: Zero LLM API imports.
 * I-2: No project-specific names.
 * I-12: Zero `any`.
 */

import { Injectable } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Regex matching the standard session log filename. */
const SESSION_LOG_REGEX = /^(\d{4}-\d{2}-\d{2})-session-(\d+)\.md$/;

// ── SessionLogPathResolver ─────────────────────────────────────────────────────

@Injectable()
export class SessionLogPathResolver {
  /**
   * Resolve the expected session log path for a session that ended at `endedAt`.
   *
   * @param endedAt      ISO-8601 string (e.g. "2026-04-27T12:00:00.000Z").
   *                     Only the date portion (YYYY-MM-DD) is used.
   * @param sessionsDir  Absolute path to the directory containing session logs.
   *                     Defaults to `<ORCH_HOME>/memory/sessions/`.
   * @returns            Absolute path to the (possibly forthcoming) session log file.
   */
  resolve(endedAt: string, sessionsDir?: string): string {
    const dir = sessionsDir ?? this._defaultSessionsDir();
    const datePrefix = endedAt.slice(0, 10); // 'YYYY-MM-DD'

    let maxN = 0;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const m = SESSION_LOG_REGEX.exec(entry);
        if (m && m[1] === datePrefix) {
          const n = parseInt(m[2] ?? '0', 10);
          if (n > maxN) maxN = n;
        }
      }
    } catch {
      // Directory may not exist yet — treat as empty; fall through to N=1.
    }

    const sessionN = maxN > 0 ? maxN : 1;
    return path.join(dir, `${datePrefix}-session-${sessionN}.md`);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _defaultSessionsDir(): string {
    const orchHome = process.env['ORCH_HOME'];
    if (orchHome) {
      return path.join(orchHome, 'memory', 'sessions');
    }
    // Fallback: agent-workspace/memory/sessions/ relative to cwd.
    return path.join(process.cwd(), 'agent-workspace', 'memory', 'sessions');
  }
}
