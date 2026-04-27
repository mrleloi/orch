/**
 * init-flow.ts — `orch init` (v2 interactive flow)
 *
 * Creates the Orch home directory tree:
 *   <ORCH_HOME>/
 *     data/
 *     logs/
 *     config/
 *       auth-token  (0600, 32-byte hex, written only if absent)
 *
 * Idempotent: if already initialized the auth-token is NOT regenerated.
 *
 * Interactive: after setup, asks "Start daemon now? [y/N]" via @inquirer/prompts
 * unless --no-interactive is set (in which case it skips the prompt).
 *
 * Prints a summary block at the end.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getOrchHome } from '../lib/orch-home.js';

const REQUIRED_SUBDIRS = ['data', 'logs', 'config'] as const;

export function getAuthTokenPath(orchHome: string): string {
  return path.join(orchHome, 'config', 'auth-token');
}

/**
 * Generate or read the 32-byte hex auth token.
 * Returns { token, wasCreated } — wasCreated=false if token already existed.
 */
export function ensureAuthToken(orchHome: string): { token: string; wasCreated: boolean } {
  const tokenPath = getAuthTokenPath(orchHome);
  const configDir = path.join(orchHome, 'config');

  if (fs.existsSync(tokenPath)) {
    const existing = fs.readFileSync(tokenPath, 'utf8').trim();
    return { token: existing, wasCreated: false };
  }

  fs.mkdirSync(configDir, { recursive: true });
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  return { token, wasCreated: true };
}

export interface InitFlowOptions {
  noInteractive?: boolean;
  /** Injected for testing — replaces @inquirer/prompts confirm call */
  confirmFn?: (message: string) => Promise<boolean>;
}

export async function runInitFlow(options: InitFlowOptions = {}): Promise<void> {
  const orchHome = getOrchHome();

  // Create home dir + required subdirs
  fs.mkdirSync(orchHome, { recursive: true });
  for (const subdir of REQUIRED_SUBDIRS) {
    fs.mkdirSync(path.join(orchHome, subdir), { recursive: true });
  }

  // Ensure auth token (idempotent)
  const { token, wasCreated } = ensureAuthToken(orchHome);
  const tokenPath = getAuthTokenPath(orchHome);

  if (wasCreated) {
    console.log(`Generated auth token → ${tokenPath}`);
  } else {
    console.log(`Auth token already exists → ${tokenPath} (not regenerated)`);
  }

  // Telegram bot setup instructions
  console.log('');
  console.log('Telegram Bot Setup (manual step):');
  console.log('  1. Open Telegram and message @BotFather');
  console.log('  2. Send /newbot and follow the prompts');
  console.log('  3. Add the bot token to ~/.orch/config.yaml under telegram.token');
  console.log('  4. Send /start to your new bot to get your chat ID');
  console.log('');

  // Interactive: ask about starting daemon
  let startNow = false;
  if (!options.noInteractive) {
    const confirmFn = options.confirmFn ?? (await importConfirm());
    startNow = await confirmFn('Start daemon now?');
  }

  if (startNow) {
    console.log('');
    console.log('To start the daemon, run:');
    console.log('  orch start');
  }

  // Summary
  console.log('');
  console.log('── Orch Init Summary ─────────────────────────────────');
  console.log(`  ORCH_HOME        : ${orchHome}`);
  console.log(`  Auth token file  : ${tokenPath}`);
  console.log(`  Auth token       : ${token.slice(0, 8)}... (${token.length} chars)`);
  console.log('');
  console.log('Next steps:');
  console.log('  orch attach <project-path>   — attach a managed project');
  console.log('  orch start                   — start the daemon');
  console.log('  orch status                  — check daemon status');
  console.log('──────────────────────────────────────────────────────');
}

/**
 * Lazy import of @inquirer/prompts confirm.
 * Returns a function with the same signature as options.confirmFn.
 */
async function importConfirm(): Promise<(message: string) => Promise<boolean>> {
  const { confirm } = await import('@inquirer/prompts');
  return (message: string) => confirm({ message });
}
