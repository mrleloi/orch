/**
 * inject-hooks.spec.ts — Tests for the hook injection utility (Task 4.5)
 *
 * All tests use temp directories; no real .claude/settings.json is ever touched.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  injectHooks,
  mergeOrchHooks,
  ORCH_HOOKS,
  ORCH_HOOK_MARKER,
  DomainError,
} from './inject-hooks.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orch-inject-hooks-'));
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function settingsPath(projectDir: string): string {
  return path.join(projectDir, '.claude', 'settings.json');
}

function claudeDir(projectDir: string): string {
  return path.join(projectDir, '.claude');
}

function readSettings(projectDir: string): unknown {
  return JSON.parse(fs.readFileSync(settingsPath(projectDir), 'utf8'));
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('injectHooks', () => {
  let tempProject: string;

  beforeEach(() => {
    tempProject = makeTempDir();
  });

  afterEach(() => {
    cleanDir(tempProject);
  });

  // ── Test 1: Empty starting state ─────────────────────────────────────────────

  it('Test 1 — absent settings.json: creates new file with all four Orch hooks', () => {
    // No .claude/settings.json — should create from scratch
    const result = injectHooks(tempProject, { nowMs: 1000 });

    expect(result.created).toBe(true);
    expect(fs.existsSync(settingsPath(tempProject))).toBe(true);

    const settings = readSettings(tempProject) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    expect(hooks).toBeDefined();

    // All four Orch event types are present
    for (const eventName of Object.keys(ORCH_HOOKS)) {
      expect(hooks[eventName]).toBeDefined();
      const groups = hooks[eventName] as Array<{ hooks: Array<{ command: string }> }>;
      const commands = groups.flatMap((g) => g.hooks.map((h) => h.command));
      expect(commands.some((cmd) => cmd.includes(ORCH_HOOK_MARKER))).toBe(true);
    }
  });

  // ── Test 2: Existing non-Orch hooks preserved ─────────────────────────────

  it('Test 2 — existing non-Orch hooks are preserved after injection', () => {
    // Start with a PreCompact hook (not an Orch hook)
    const existingSettings = {
      hooks: {
        PreCompact: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo pre-compact',
              },
            ],
          },
        ],
      },
    };
    fs.mkdirSync(claudeDir(tempProject), { recursive: true });
    fs.writeFileSync(settingsPath(tempProject), JSON.stringify(existingSettings, null, 2), 'utf8');

    injectHooks(tempProject, { nowMs: 2000 });

    const settings = readSettings(tempProject) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    // PreCompact preserved
    expect(hooks['PreCompact']).toBeDefined();
    const preCompactGroups = hooks['PreCompact'] as Array<{
      hooks: Array<{ command: string }>;
    }>;
    const preCompactCmds = preCompactGroups.flatMap((g) => g.hooks.map((h) => h.command));
    expect(preCompactCmds).toContain('echo pre-compact');

    // Orch hooks added
    for (const eventName of Object.keys(ORCH_HOOKS)) {
      expect(hooks[eventName]).toBeDefined();
    }
  });

  // ── Test 3: Idempotent on re-run ─────────────────────────────────────────

  it('Test 3 — idempotent: running inject twice produces no duplicate entries', () => {
    fs.mkdirSync(claudeDir(tempProject), { recursive: true });
    fs.writeFileSync(settingsPath(tempProject), '{}', 'utf8');

    injectHooks(tempProject, { nowMs: 3000 });
    injectHooks(tempProject, { nowMs: 3001 });

    const settings = readSettings(tempProject) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    // Each event must have exactly ONE Orch hook entry
    for (const eventName of Object.keys(ORCH_HOOKS)) {
      const groups = hooks[eventName] as Array<{ hooks: Array<{ command: string }> }>;
      const orchCmds = groups
        .flatMap((g) => g.hooks.map((h) => h.command))
        .filter((cmd) => cmd.includes(ORCH_HOOK_MARKER));
      expect(orchCmds).toHaveLength(1);
    }
  });

  // ── Test 4: Existing Orch hook with different path gets replaced ──────────

  it('Test 4 — existing Orch hook with different path is replaced, not duplicated', () => {
    // Simulate an old Orch hook pointing at a different path
    const oldOrchCommand = 'bash "/old/path/scripts/hooks/orch-receiver.sh" SessionStart';
    const startingSettings = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: oldOrchCommand,
              },
            ],
          },
        ],
      },
    };
    fs.mkdirSync(claudeDir(tempProject), { recursive: true });
    fs.writeFileSync(
      settingsPath(tempProject),
      JSON.stringify(startingSettings, null, 2),
      'utf8',
    );

    injectHooks(tempProject, { nowMs: 4000 });

    const settings = readSettings(tempProject) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    const groups = hooks['SessionStart'] as Array<{ hooks: Array<{ command: string }> }>;
    const allCmds = groups.flatMap((g) => g.hooks.map((h) => h.command));

    // Old command must be gone
    expect(allCmds).not.toContain(oldOrchCommand);

    // Exactly one Orch hook (the new canonical one)
    const orchCmds = allCmds.filter((cmd) => cmd.includes(ORCH_HOOK_MARKER));
    expect(orchCmds).toHaveLength(1);
    expect(orchCmds[0]).toBe(ORCH_HOOKS['SessionStart']!.command);
  });

  // ── Test 5: Malformed JSON → DomainError, original file untouched ─────────

  it('Test 5 — malformed JSON is rejected with DomainError; original file untouched', () => {
    const corrupt = '{ "hooks": { "SessionStart": [ INVALID JSON }}}';
    fs.mkdirSync(claudeDir(tempProject), { recursive: true });
    fs.writeFileSync(settingsPath(tempProject), corrupt, 'utf8');

    expect(() => injectHooks(tempProject, { nowMs: 5000 })).toThrow(DomainError);

    let thrownError: DomainError | null = null;
    try {
      injectHooks(tempProject, { nowMs: 5001 });
    } catch (err) {
      thrownError = err as DomainError;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError!.code).toBe('SETTINGS_INVALID');

    // Original file content untouched
    const content = fs.readFileSync(settingsPath(tempProject), 'utf8');
    expect(content).toBe(corrupt);

    // No backup written (we abort before backup on parse failure)
    const backupPattern = `settings.json.backup-`;
    const files = fs.readdirSync(claudeDir(tempProject));
    expect(files.some((f) => f.includes(backupPattern))).toBe(false);
  });

  // ── Test 6: Backup exists after successful write ──────────────────────────

  it('Test 6 — backup file exists after success; backup contents match pre-mutation original', () => {
    const original = JSON.stringify({ permissions: { allow: ['Read(*)'] } }, null, 2);
    fs.mkdirSync(claudeDir(tempProject), { recursive: true });
    fs.writeFileSync(settingsPath(tempProject), original, 'utf8');

    const ts = 6000;
    const result = injectHooks(tempProject, { nowMs: ts });

    const expectedBackupPath = path.join(claudeDir(tempProject), `settings.json.backup-${ts}`);
    expect(fs.existsSync(expectedBackupPath)).toBe(true);
    expect(result.backupPath).toBe(expectedBackupPath);

    // Backup must contain the PRE-mutation content
    const backupContent = fs.readFileSync(expectedBackupPath, 'utf8');
    expect(backupContent).toBe(original);

    // Post-mutation settings differs from original (hooks were added)
    const newContent = fs.readFileSync(settingsPath(tempProject), 'utf8');
    expect(newContent).not.toBe(original);
  });

  // ── Test 7: Atomic write — no .tmp lingers on success or failure ──────────

  it('Test 7 — no .tmp file lingers on disk after a successful write', () => {
    fs.mkdirSync(claudeDir(tempProject), { recursive: true });
    fs.writeFileSync(settingsPath(tempProject), '{}', 'utf8');

    injectHooks(tempProject, { nowMs: 7000 });

    const tmpPath = path.join(claudeDir(tempProject), 'settings.json.tmp');
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  // ── Test 8: settings.json without hooks key; other keys preserved ─────────

  it('Test 8 — settings.json without hooks key: hooks added; existing keys preserved', () => {
    const existing = {
      permissions: { allow: ['Read(*)'], deny: ['Write(**)'] },
      env: { NODE_ENV: 'production' },
    };
    fs.mkdirSync(claudeDir(tempProject), { recursive: true });
    fs.writeFileSync(settingsPath(tempProject), JSON.stringify(existing, null, 2), 'utf8');

    injectHooks(tempProject, { nowMs: 8000 });

    const settings = readSettings(tempProject) as Record<string, unknown>;

    // Existing top-level keys preserved
    expect(settings['permissions']).toEqual(existing.permissions);
    expect(settings['env']).toEqual(existing.env);

    // Hooks block added
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    expect(hooks).toBeDefined();
    for (const eventName of Object.keys(ORCH_HOOKS)) {
      expect(hooks[eventName]).toBeDefined();
    }
  });
});

// ── mergeOrchHooks unit tests ──────────────────────────────────────────────────

describe('mergeOrchHooks', () => {
  it('adds all four Orch event types to an empty settings object', () => {
    const result = mergeOrchHooks({});
    const hooks = result.hooks!;
    expect(Object.keys(hooks)).toEqual(
      expect.arrayContaining(['SessionStart', 'Stop', 'SubagentStop', 'PostToolUse']),
    );
  });

  it('does not touch hooks that belong to other event types', () => {
    const input = {
      hooks: {
        PreCompact: [{ hooks: [{ type: 'command' as const, command: 'echo hi' }] }],
      },
    };
    const result = mergeOrchHooks(input);
    expect(result.hooks!['PreCompact']).toEqual(input.hooks.PreCompact);
  });

  it('ORCH_HOOK_MARKER is present in every canonical Orch hook command', () => {
    for (const entry of Object.values(ORCH_HOOKS)) {
      expect(entry.command).toContain(ORCH_HOOK_MARKER);
    }
  });
});
