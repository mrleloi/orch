/**
 * session-log-path-resolver.spec.ts — Unit tests for SessionLogPathResolver.
 *
 * Coverage (Task 4.1 §5):
 *  - T-SLPR-1: returns correct path when matching session log files exist.
 *  - T-SLPR-2: returns session-1 when no files exist for the date (forthcoming path).
 *  - T-SLPR-3: picks the highest N when multiple session files exist for the same date.
 *  - T-SLPR-4: path always ends with .md.
 *  - T-SLPR-5: works with sessionsDir that doesn't exist (returns forthcoming path).
 *  - T-SLPR-6: uses custom sessionsDir argument when provided.
 *
 * I-1: No LLM API imports.
 * I-2: No project-specific names.
 * I-12: Zero `any`.
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SessionLogPathResolver } from './session-log-path-resolver.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orch-slpr-test-'));
}

function resolver(): SessionLogPathResolver {
  return new SessionLogPathResolver();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionLogPathResolver.resolve', () => {
  afterAll(() => {
    // No global state to clean up — each test uses its own tmp dir.
  });

  // T-SLPR-1: matching session log files exist
  it('T-SLPR-1: returns the highest-N session log file matching the date prefix', () => {
    const dir = makeTmpDir();
    try {
      // Create session files for 2026-04-27
      fs.writeFileSync(path.join(dir, '2026-04-27-session-1.md'), '');
      fs.writeFileSync(path.join(dir, '2026-04-27-session-2.md'), '');
      fs.writeFileSync(path.join(dir, '2026-04-27-session-3.md'), '');

      const result = resolver().resolve('2026-04-27T12:00:00.000Z', dir);

      expect(result).toBe(path.join(dir, '2026-04-27-session-3.md'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // T-SLPR-2: no files exist → returns session-1 (forthcoming path)
  it('T-SLPR-2: returns session-1 path when no session log files exist for the date', () => {
    const dir = makeTmpDir();
    try {
      const result = resolver().resolve('2026-04-27T12:00:00.000Z', dir);

      expect(result).toBe(path.join(dir, '2026-04-27-session-1.md'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // T-SLPR-3: picks max N when multiple files exist
  it('T-SLPR-3: picks the max sequence number when files are out of alphabetical order', () => {
    const dir = makeTmpDir();
    try {
      // Create non-sequential order
      fs.writeFileSync(path.join(dir, '2026-04-27-session-5.md'), '');
      fs.writeFileSync(path.join(dir, '2026-04-27-session-2.md'), '');
      fs.writeFileSync(path.join(dir, '2026-04-27-session-10.md'), '');

      const result = resolver().resolve('2026-04-27T00:00:00Z', dir);

      expect(result).toBe(path.join(dir, '2026-04-27-session-10.md'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // T-SLPR-4: path always ends with .md
  it('T-SLPR-4: returned path always ends with .md', () => {
    const dir = makeTmpDir();
    try {
      const result = resolver().resolve('2026-04-27T12:00:00.000Z', dir);

      expect(result).toMatch(/\.md$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // T-SLPR-5: sessionsDir does not exist → returns forthcoming path (no throw)
  it('T-SLPR-5: returns forthcoming session-1 path when sessionsDir does not exist', () => {
    const nonExistentDir = path.join(os.tmpdir(), `orch-slpr-nonexistent-${Date.now()}`);

    // Should NOT throw
    const result = resolver().resolve('2026-04-27T12:00:00.000Z', nonExistentDir);

    expect(result).toBe(path.join(nonExistentDir, '2026-04-27-session-1.md'));
    expect(result).toMatch(/\.md$/);
  });

  // T-SLPR-6: uses custom sessionsDir argument when provided
  it('T-SLPR-6: uses the provided sessionsDir argument and ignores ORCH_HOME env', () => {
    const dir = makeTmpDir();
    const fakeOrchHome = path.join(os.tmpdir(), `orch-slpr-fake-home-${Date.now()}`);
    try {
      fs.writeFileSync(path.join(dir, '2026-04-27-session-4.md'), '');
      // Set ORCH_HOME to a different dir — should NOT affect the result
      const originalOrchHome = process.env['ORCH_HOME'];
      process.env['ORCH_HOME'] = fakeOrchHome;
      try {
        const result = resolver().resolve('2026-04-27T12:00:00.000Z', dir);
        expect(result).toBe(path.join(dir, '2026-04-27-session-4.md'));
      } finally {
        if (originalOrchHome !== undefined) {
          process.env['ORCH_HOME'] = originalOrchHome;
        } else {
          delete process.env['ORCH_HOME'];
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // T-SLPR-7: ignores files from other dates
  it('T-SLPR-7: ignores session log files from different dates', () => {
    const dir = makeTmpDir();
    try {
      // Add files for a different date
      fs.writeFileSync(path.join(dir, '2026-04-26-session-5.md'), '');
      fs.writeFileSync(path.join(dir, '2026-04-28-session-3.md'), '');
      // Add one file for the target date
      fs.writeFileSync(path.join(dir, '2026-04-27-session-2.md'), '');

      const result = resolver().resolve('2026-04-27T12:00:00.000Z', dir);

      expect(result).toBe(path.join(dir, '2026-04-27-session-2.md'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
