#!/usr/bin/env node
/**
 * main.ts — `orch` CLI binary entry point.
 *
 * Uses commander for command parsing.
 * Dispatches to individual command modules.
 *
 * Note: source-map support is enabled via `--enable-source-maps` in the
 * shebang or Node.js invocation so TS stack traces are readable.
 */

import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { runAttach } from './commands/attach.js';
import { runStart } from './commands/start.js';
import { runStop } from './commands/stop.js';
import { runStatus } from './commands/status.js';

const program = new Command();

program
  .name('orch')
  .description('Orch — Claude Code orchestration daemon CLI')
  .version('0.0.1');

// ── orch init ──────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize Orch home directory (~/.orch or $ORCH_HOME)')
  .action(() => {
    runInit();
  });

// ── orch attach ────────────────────────────────────────────────────────────────

program
  .command('attach <projectPath>')
  .description('Register a managed project with Orch')
  .option('--ccs-profile <name>', 'CCS profile name to associate with this project')
  .action((projectPath: string, options: { ccsProfile?: string }) => {
    runAttach(projectPath, options);
  });

// ── orch start ─────────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start the Orch daemon (inherits stdio)')
  .action(() => {
    runStart();
  });

// ── orch stop ──────────────────────────────────────────────────────────────────

program
  .command('stop')
  .description('Stop the Orch daemon (SIGTERM via pidfile)')
  .action(() => {
    runStop();
  });

// ── orch status ────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show daemon status (projects, sessions, queue)')
  .action(async () => {
    await runStatus();
  });

program.parse(process.argv);
