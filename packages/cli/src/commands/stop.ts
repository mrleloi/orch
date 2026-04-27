/**
 * stop.ts — `orch stop`
 *
 * Reads the pidfile written by `orch start`, sends SIGTERM to the daemon process,
 * then removes the pidfile.
 *
 * On Windows, process.kill(pid) sends a termination signal (best-effort).
 * Acceptable for Phase 1 per spec.
 */

import fs from 'node:fs';
import { getPidFilePath } from './start.js';

export function runStop(): void {
  const pidFile = getPidFilePath();

  if (!fs.existsSync(pidFile)) {
    console.error('No daemon pidfile found. Is the daemon running?');
    process.exit(1);
  }

  const raw = fs.readFileSync(pidFile, 'utf8').trim();
  const pid = parseInt(raw, 10);

  if (isNaN(pid) || pid <= 0) {
    console.error(`Invalid pid in ${pidFile}: ${raw}`);
    fs.unlinkSync(pidFile);
    process.exit(1);
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Sent SIGTERM to daemon process ${pid}`);
  } catch (err) {
    const errMsg = String(err);
    if (errMsg.includes('ESRCH') || errMsg.includes('no such process')) {
      console.log(`Daemon process ${pid} is not running. Cleaning up pidfile.`);
    } else {
      console.error(`Failed to signal process ${pid}: ${errMsg}`);
      process.exit(1);
    }
  }

  // Remove pidfile
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // ignore — already removed
  }
}
