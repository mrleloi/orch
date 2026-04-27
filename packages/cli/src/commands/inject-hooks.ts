/**
 * inject-hooks.ts — Merges Orch hooks into a project's .claude/settings.json
 *
 * Charter S4 triple safety (mandatory):
 *   1. Validate existing JSON BEFORE backup (aborts on parse failure, never writes)
 *   2. Atomic backup BEFORE any mutation (.claude/settings.json.backup-<ts>)
 *   3. Atomic write via fs.rename (tmp → final)
 *
 * Orch hooks are identified by their command string (ORCH_HOOK_MARKER substring).
 * Idempotent: running twice never produces duplicate entries.
 * Replacement semantics: if an existing hook matches the Orch marker but has a
 * different full command, it is REPLACED (not duplicated). This handles path drift
 * across Orch versions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// ── Error type ─────────────────────────────────────────────────────────────────

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// ── Settings schema (permissive — preserve unknown keys) ──────────────────────

const HookEntrySchema = z.object({
  type: z.literal('command'),
  command: z.string(),
});

const HookGroupSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(HookEntrySchema),
});

const HooksBlockSchema = z.record(z.string(), z.array(HookGroupSchema));

const SettingsSchema = z.object({
  hooks: HooksBlockSchema.optional(),
}).passthrough();

export type HookEntry = z.infer<typeof HookEntrySchema>;
export type HookGroup = z.infer<typeof HookGroupSchema>;
export type SettingsJson = z.infer<typeof SettingsSchema>;

// ── Orch hook definitions ─────────────────────────────────────────────────────

/**
 * Substring present in every Orch-injected hook command. Used to detect and
 * deduplicate existing Orch hooks regardless of path drift.
 */
export const ORCH_HOOK_MARKER = 'orch-receiver.sh';

/**
 * The four Orch hooks to inject into a managed project's .claude/settings.json.
 * Commands use ${CLAUDE_PROJECT_DIR:-.} (per project memory rule) so they resolve
 * correctly regardless of the cwd the hook fires from.
 */
export const ORCH_HOOKS: Record<string, HookEntry> = {
  SessionStart: {
    type: 'command',
    command: 'bash "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/orch-receiver.sh" SessionStart',
  },
  Stop: {
    type: 'command',
    command: 'bash "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/orch-receiver.sh" Stop',
  },
  SubagentStop: {
    type: 'command',
    command: 'bash "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/orch-receiver.sh" SubagentStop',
  },
  PostToolUse: {
    type: 'command',
    command: 'bash "${CLAUDE_PROJECT_DIR:-.}/scripts/hooks/orch-receiver.sh" PostToolUse',
  },
};

// ── Core logic ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the hook entry was injected by Orch (identified by ORCH_HOOK_MARKER).
 */
function isOrchHook(entry: HookEntry): boolean {
  return entry.command.includes(ORCH_HOOK_MARKER);
}

/**
 * Merge Orch hooks into an existing hooks block non-destructively.
 *
 * For each event type (SessionStart, Stop, SubagentStop, PostToolUse):
 *   - Find or create a matcher-less top-level group.
 *   - Remove any existing Orch entries in that group (by ORCH_HOOK_MARKER match).
 *   - Append the canonical Orch entry.
 *   - Non-Orch entries in the group are preserved as-is.
 *   - Other event types (PreCompact, etc.) are untouched.
 */
export function mergeOrchHooks(existing: SettingsJson): SettingsJson {
  const hooks: Record<string, HookGroup[]> = { ...(existing.hooks ?? {}) };

  for (const [eventName, orchEntry] of Object.entries(ORCH_HOOKS)) {
    const groups: HookGroup[] = hooks[eventName] ? [...hooks[eventName]!] : [];

    // Find the first group without a matcher (or create one).
    // Orch hooks are always placed in a matcher-less group.
    let targetGroupIndex = groups.findIndex((g) => g.matcher == null);
    if (targetGroupIndex === -1) {
      groups.push({ hooks: [] });
      targetGroupIndex = groups.length - 1;
    }

    // Clone the group; remove existing Orch entries; append the canonical entry.
    const group = groups[targetGroupIndex]!;
    const filteredEntries = group.hooks.filter((e) => !isOrchHook(e));
    const newGroup: HookGroup = {
      ...group,
      hooks: [...filteredEntries, orchEntry],
    };

    groups[targetGroupIndex] = newGroup;
    hooks[eventName] = groups;
  }

  return { ...existing, hooks };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface InjectHooksResult {
  backupPath: string;
  settingsPath: string;
  created: boolean; // true if settings.json did not previously exist
}

/**
 * Injects Orch hooks into <projectPath>/.claude/settings.json.
 *
 * Triple safety (Charter S4):
 *   1. Validates existing JSON BEFORE backup (aborts on parse failure, never writes).
 *   2. Writes atomic backup BEFORE mutation.
 *   3. Writes merged result to .tmp then fs.rename (atomic on POSIX; best-effort on Windows).
 *
 * @param projectPath Absolute path to the project root.
 * @param nowMs       Injectable timestamp (ms) for deterministic backup names in tests.
 */
export function injectHooks(
  projectPath: string,
  { nowMs = Date.now() }: { nowMs?: number } = {},
): InjectHooksResult {
  const claudeDir = path.join(projectPath, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const backupPath = path.join(claudeDir, `settings.json.backup-${nowMs}`);
  const tmpPath = path.join(claudeDir, `settings.json.tmp`);

  // ── 1. Read or initialise ──────────────────────────────────────────────────
  let rawJson: string;
  let created = false;

  if (!fs.existsSync(settingsPath)) {
    // No existing settings — start from empty base
    rawJson = '{}';
    created = true;
  } else {
    rawJson = fs.readFileSync(settingsPath, 'utf8');
  }

  // ── 2. Validate existing JSON (abort before backup if corrupt) ─────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new DomainError(
      'SETTINGS_INVALID',
      `Cannot parse .claude/settings.json: invalid JSON. Aborting hook injection to avoid data loss.`,
    );
  }

  const parseResult = SettingsSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new DomainError(
      'SETTINGS_INVALID',
      `settings.json structure is invalid: ${parseResult.error.message}`,
    );
  }
  const existing: SettingsJson = parseResult.data;

  // ── 3. Merge hooks ─────────────────────────────────────────────────────────
  const merged = mergeOrchHooks(existing);

  // ── 4. Validate merged result via round-trip (belt-and-suspenders) ─────────
  const mergedJson = JSON.stringify(merged, null, 2);
  try {
    JSON.parse(mergedJson);
  } catch {
    throw new DomainError(
      'SETTINGS_INVALID',
      `Merged settings.json failed round-trip validation. Aborting to preserve original.`,
    );
  }

  // ── 5. Atomic backup BEFORE mutation ─────────────────────────────────────
  if (!created) {
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(backupPath, rawJson, 'utf8');
  } else {
    // Ensure .claude/ dir exists even when creating from scratch
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // ── 6. Atomic write via tmp → rename ─────────────────────────────────────
  try {
    fs.writeFileSync(tmpPath, mergedJson + '\n', 'utf8');
    fs.renameSync(tmpPath, settingsPath);
  } catch (err) {
    // Clean up tmp if rename failed
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // best-effort cleanup; ignore secondary error
    }
    throw err;
  }

  return { backupPath: created ? '' : backupPath, settingsPath, created };
}
