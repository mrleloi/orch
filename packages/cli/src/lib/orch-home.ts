/**
 * orch-home.ts — Resolves the Orch home directory.
 *
 * Priority:
 *  1. ORCH_HOME env var
 *  2. ~/.orch (os.homedir() + '/.orch')
 *
 * Returns the absolute path string (does NOT ensure it exists).
 */

import os from 'node:os';
import path from 'node:path';

export function getOrchHome(): string {
  const envHome = process.env['ORCH_HOME'];
  if (envHome != null && envHome.trim() !== '') {
    return path.resolve(envHome.trim());
  }
  return path.join(os.homedir(), '.orch');
}
