/**
 * start.ts — `orch start`
 *
 * Spawns the daemon via `node <core-dist-main>`.
 *
 * - Locates core dist at ../core/dist/main.js (workspace-local resolution)
 * - Inherits stdio for Phase 1 (no detach)
 * - Writes pidfile to <ORCH_HOME>/state/orch.pid
 * - Exits with the daemon's exit code
 *
 * If core dist is missing → helpful error pointing user to build first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getOrchHome } from '../lib/orch-home.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveCoreDist(): string {
  // From packages/cli/dist/commands/start.js → packages/core/dist/main.js
  // Up: commands/ → dist/ → cli/ → packages/ then into core/dist/main.js
  return path.resolve(__dirname, '..', '..', '..', 'core', 'dist', 'main.js');
}

export function getPidFilePath(): string {
  return path.join(getOrchHome(), 'state', 'orch.pid');
}

export function runStart(): void {
  const coreMain = resolveCoreDist();

  if (!fs.existsSync(coreMain)) {
    console.error(
      `Error: daemon entry not found at ${coreMain}\n` +
        `Run \`pnpm --filter @orch/core build\` first.`,
    );
    process.exit(1);
  }

  const orchHome = getOrchHome();
  const stateDir = path.join(orchHome, 'state');
  fs.mkdirSync(stateDir, { recursive: true });

  const pidFile = getPidFilePath();

  const child = spawn(process.execPath, [coreMain], {
    stdio: 'inherit',
    env: process.env as NodeJS.ProcessEnv,
  });

  if (child.pid != null) {
    fs.writeFileSync(pidFile, String(child.pid), 'utf8');
  }

  child.on('exit', (code, signal) => {
    // Clean up pidfile on exit
    try {
      fs.unlinkSync(pidFile);
    } catch {
      // ignore — already removed or never existed
    }
    const exitCode = code ?? (signal != null ? 1 : 0);
    process.exit(exitCode);
  });
}
