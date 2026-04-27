/**
 * init.ts — `orch init`
 *
 * Creates the Orch home directory tree:
 *   <ORCH_HOME>/
 *     projects/
 *     state/
 *     logs/
 *     config.yaml  (written only if not exists)
 *
 * Idempotent: if already initialized, prints a message and exits 0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getOrchHome } from '../lib/orch-home.js';
import { DEFAULT_CONFIG_YAML } from '../lib/config.js';

const REQUIRED_SUBDIRS = ['projects', 'state', 'logs'] as const;

export function runInit(): void {
  const orchHome = getOrchHome();
  const configPath = path.join(orchHome, 'config.yaml');

  // Idempotent check: if home dir AND config both exist, already initialized
  if (fs.existsSync(orchHome) && fs.existsSync(configPath)) {
    console.log(`already initialized at ${orchHome}`);
    return;
  }

  // Create home dir if needed
  fs.mkdirSync(orchHome, { recursive: true });

  // Create subdirs
  for (const subdir of REQUIRED_SUBDIRS) {
    fs.mkdirSync(path.join(orchHome, subdir), { recursive: true });
  }

  // Write default config if not present
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG_YAML, 'utf8');
  }

  console.log(`Orch initialized at ${orchHome}`);
}
