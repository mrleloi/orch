/**
 * attach.ts — `orch attach <projectPath>`
 *
 * Registers a managed project with Orch.
 *
 * Validation:
 *  - <projectPath> must exist
 *  - Must contain .orch/profile.yaml
 *
 * Registration:
 *  - Reads ~/.orch/projects/registry.json (array of registry entries)
 *  - Deduplicates by absolute path
 *  - Atomic write: writes to temp file, then renames
 *
 * Options:
 *  --ccs-profile <name>   Optional CCS profile to store alongside path
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getOrchHome } from '../lib/orch-home.js';

export interface RegistryEntry {
  path: string;
  ccsProfile?: string;
  addedAt: string;
}

function readRegistry(registryPath: string): RegistryEntry[] {
  if (!fs.existsSync(registryPath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(registryPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as RegistryEntry[];
  } catch {
    return [];
  }
}

function writeRegistryAtomic(registryPath: string, entries: RegistryEntry[]): void {
  const dir = path.dirname(registryPath);
  fs.mkdirSync(dir, { recursive: true });

  // Write to temp file, then rename (atomic on POSIX; best-effort on Windows)
  const tmpPath = path.join(
    os.tmpdir(),
    `orch-registry-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  fs.writeFileSync(tmpPath, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(tmpPath, registryPath);
}

export function runAttach(projectPath: string, options: { ccsProfile?: string }): void {
  const absPath = path.resolve(projectPath);

  // Validate path exists
  if (!fs.existsSync(absPath)) {
    console.error(`Error: path does not exist: ${absPath}`);
    process.exit(1);
  }

  // Validate .orch/profile.yaml presence
  const profileYamlPath = path.join(absPath, '.orch', 'profile.yaml');
  if (!fs.existsSync(profileYamlPath)) {
    console.error(
      `Error: no .orch/profile.yaml found at ${absPath}\n` +
        `Create one to define the project profile (see docs for format).`,
    );
    process.exit(1);
  }

  const orchHome = getOrchHome();
  const registryPath = path.join(orchHome, 'projects', 'registry.json');

  const entries = readRegistry(registryPath);

  // Dedup by absolute path
  const existingIdx = entries.findIndex((e) => e.path === absPath);
  if (existingIdx !== -1) {
    // Update ccsProfile if provided, otherwise just report
    const existing = entries[existingIdx];
    if (existing != null && options.ccsProfile != null) {
      existing.ccsProfile = options.ccsProfile;
      writeRegistryAtomic(registryPath, entries);
      console.log(`Updated ccs-profile for ${absPath}`);
    } else {
      console.log(`already registered: ${absPath}`);
    }
    return;
  }

  const entry: RegistryEntry = {
    path: absPath,
    addedAt: new Date().toISOString(),
    ...(options.ccsProfile != null ? { ccsProfile: options.ccsProfile } : {}),
  };

  entries.push(entry);
  writeRegistryAtomic(registryPath, entries);

  console.log(`Registered project: ${absPath}`);
  if (options.ccsProfile != null) {
    console.log(`  ccs-profile: ${options.ccsProfile}`);
  }
}
