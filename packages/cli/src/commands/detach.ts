/**
 * detach.ts — `orch detach <projectPath>`
 *
 * Removes a managed project from Orch:
 *  1. Validates .orch/profile.yaml exists.
 *  2. Restores .claude/settings.json from the most recent backup (if found).
 *  3. Deletes .orch/profile.yaml (and the backup it restored from — most recent only).
 *  4. Unregisters from daemon: best-effort DELETE /api/v1/projects/<name>.
 *
 * Does NOT commit any git changes. No credential reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { getOrchHome } from '../lib/orch-home.js';

export interface DetachOptions {
  /** Injected fetch implementation for testing */
  fetchFn?: typeof fetch;
}

interface ProjectProfile {
  name?: string;
}

/**
 * Finds the most recent .claude/settings.json.backup-* file in the project.
 * Returns null if none found.
 */
export function findMostRecentBackup(absPath: string): string | null {
  const claudeDir = path.join(absPath, '.claude');
  if (!fs.existsSync(claudeDir)) {
    return null;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(claudeDir);
  } catch {
    return null;
  }

  const backups = entries
    .filter((e) => e.startsWith('settings.json.backup-'))
    .map((e) => path.join(claudeDir, e))
    .sort()
    .reverse(); // newest first (lexicographic sort works for timestamp-suffixed names)

  return backups.length > 0 ? (backups[0] ?? null) : null;
}

/**
 * Read project name from .orch/profile.yaml.
 * Falls back to directory basename on parse errors.
 */
function readProjectName(absPath: string): string {
  const profilePath = path.join(absPath, '.orch', 'profile.yaml');
  try {
    const raw = fs.readFileSync(profilePath, 'utf8');
    const parsed = yaml.load(raw) as ProjectProfile | null;
    if (parsed != null && typeof parsed.name === 'string') {
      return parsed.name;
    }
  } catch {
    // fall through
  }
  return path.basename(absPath);
}

/**
 * Build the daemon base URL from ~/.orch/config.yaml (best-effort).
 * Falls back to default localhost:4141.
 */
function buildDaemonBaseUrl(orchHome: string): string {
  const configPath = path.join(orchHome, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    return 'http://127.0.0.1:4141';
  }
  try {
    // Minimal parse — avoid importing the full config module to keep this module lean
    const content = fs.readFileSync(configPath, 'utf8');
    const portMatch = /port:\s*(\d+)/.exec(content);
    const hostMatch = /host:\s*(\S+)/.exec(content);
    const port = portMatch != null ? portMatch[1] : '4141';
    const host = hostMatch != null ? hostMatch[1] : '127.0.0.1';
    return `http://${host}:${port}`;
  } catch {
    return 'http://127.0.0.1:4141';
  }
}

export async function runDetach(
  projectPath: string,
  options: DetachOptions = {},
): Promise<void> {
  const absPath = path.resolve(projectPath);
  const profilePath = path.join(absPath, '.orch', 'profile.yaml');

  // Validate profile exists
  if (!fs.existsSync(profilePath)) {
    console.error(
      `Error: no .orch/profile.yaml found at ${absPath}. ` +
        `Is this project attached to Orch?`,
    );
    process.exit(1);
  }

  const projectName = readProjectName(absPath);

  // Restore .claude/settings.json from backup (if any)
  const backup = findMostRecentBackup(absPath);
  const settingsPath = path.join(absPath, '.claude', 'settings.json');

  if (backup != null) {
    fs.copyFileSync(backup, settingsPath);
    console.log(`Restored .claude/settings.json from ${path.basename(backup)}`);
    // Delete the backup we just restored (most recent only — older backups preserved)
    fs.unlinkSync(backup);
    console.log(`Deleted backup: ${path.basename(backup)}`);
  } else {
    console.warn(
      `Warning: no .claude/settings.json backup found — ` +
        `settings.json left unmodified (hook injection may not have run).`,
    );
  }

  // Delete profile.yaml
  fs.unlinkSync(profilePath);
  console.log(`Deleted .orch/profile.yaml`);

  // Best-effort unregister from daemon
  const orchHome = getOrchHome();
  const daemonUrl = buildDaemonBaseUrl(orchHome);
  const deleteUrl = `${daemonUrl}/api/v1/projects/${encodeURIComponent(projectName)}`;

  const fetchFn = options.fetchFn ?? fetch;
  try {
    const resp = await fetchFn(deleteUrl, { method: 'DELETE' });
    if (resp.ok || resp.status === 404) {
      console.log(`Unregistered project '${projectName}' from daemon.`);
    } else {
      console.warn(
        `Warning: daemon returned ${resp.status} when unregistering. ` +
          `You may need to restart the daemon.`,
      );
    }
  } catch {
    console.warn(
      `Warning: could not reach daemon at ${daemonUrl} — ` +
        `project '${projectName}' may remain in registry until daemon restarts.`,
    );
  }

  // Summary
  console.log('');
  console.log('── Detach Summary ────────────────────────────────────');
  console.log(`  Project          : ${projectName}`);
  console.log(`  Path             : ${absPath}`);
  console.log(`  Profile deleted  : yes`);
  console.log(`  Backup restored  : ${backup != null ? 'yes' : 'no (none found)'}`);
  console.log('──────────────────────────────────────────────────────');
}
