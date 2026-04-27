/**
 * HandoffModule — NestJS module for deterministic session handoff context generation.
 *
 * Provides:
 *  - HandoffContextBuilder: orchestrates L0 (git diff) + L1 (log parse) + render.
 *  - GitDiffCollector: execa wrapper around `git diff --stat`.
 *  - SessionLogParser: markdown → SessionLogSummary state machine.
 *  - PromptRenderer: DTO → plain-text prompt with token cap.
 *
 * DI token wiring:
 *  - EXECA_TOKEN: injects the execa function into GitDiffCollector.
 *    Factory hard-codes the binary type as 'git' (decision 006 §Enforcement).
 *  - FS_TOKEN: injects an IFsReader into SessionLogParser.
 *    Factory wraps node:fs/promises for testability.
 *  - LOGGER_TOKEN: injects an ILogger into HandoffContextBuilder.
 *    Factory wraps NestJS Logger.
 *
 * Decision 006 (binding): zero LLM API imports anywhere in this module.
 * See agent-workspace/memory/decisions/006-handoff-no-llm.md.
 *
 * I-1: No Anthropic SDK / OpenAI / claude-agent-sdk imports.
 * I-2: No project-specific names ('stockforge', etc.).
 * I-12: Zero `any` in provider or token types.
 *
 * Wire-up into AppModule: Task 3.6 (not here — see plan A.7 note).
 * This module is bootstrapped in isolation via Test.createTestingModule in tests.
 */

import { Module, Logger } from '@nestjs/common';
import { DbModule } from '../db/prisma.module.js';
import { ProjectRegistryModule } from '../project-registry/project-registry.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { promises as fsPromises } from 'node:fs';
import execa from 'execa';
import {
  EXECA_TOKEN,
  FS_TOKEN,
  LOGGER_TOKEN,
  type ExecaFn,
  type IFsReader,
  type ILogger,
} from './types.js';
import { GitDiffCollector } from './git-diff-collector.js';
import { SessionLogParser } from './session-log-parser.js';
import { PromptRenderer } from './prompt-renderer.js';
import { HandoffContextBuilder } from './handoff-context-builder.js';
import { HandoffOrchestratorService } from './handoff-orchestrator.service.js';
import { SessionLogPathResolver } from './session-log-path-resolver.js';

/**
 * Factory: wraps `node:fs/promises` as IFsReader.
 * Injected into SessionLogParser via FS_TOKEN.
 */
function createFsReader(): IFsReader {
  return {
    readFile: (path: string, encoding: 'utf-8') =>
      fsPromises.readFile(path, encoding),
    stat: async (path: string) => {
      const s = await fsPromises.stat(path);
      return { size: s.size };
    },
  };
}

/**
 * Factory: wraps NestJS Logger as ILogger.
 * Injected into HandoffContextBuilder via LOGGER_TOKEN.
 */
function createLogger(): ILogger {
  const nestLogger = new Logger('HandoffContextBuilder');
  return {
    log: (msg: string, ctx?: Record<string, unknown>) =>
      nestLogger.log({ msg, ...ctx }),
    warn: (msg: string, ctx?: Record<string, unknown>) =>
      nestLogger.warn({ msg, ...ctx }),
    error: (msg: string, ctx?: Record<string, unknown>) =>
      nestLogger.error({ msg, ...ctx }),
  };
}

@Module({
  imports: [DbModule, ProjectRegistryModule, SessionsModule],
  providers: [
    GitDiffCollector,
    SessionLogParser,
    PromptRenderer,
    HandoffContextBuilder,
    HandoffOrchestratorService,
    SessionLogPathResolver,
    {
      provide: EXECA_TOKEN,
      useFactory: (): ExecaFn => execa,
    },
    {
      provide: FS_TOKEN,
      useFactory: (): IFsReader => createFsReader(),
    },
    {
      provide: LOGGER_TOKEN,
      useFactory: (): ILogger => createLogger(),
    },
    // TRACER_TOKEN is provided in AppModule pointing to TracingService (Task 3.6).
    // HandoffContextBuilder uses @Optional() @Inject(TRACER_TOKEN), so the token
    // can also be absent in isolated module tests (builder skips span emission).
    //
    // IAGENT_RUNTIME: resolved from SessionsModule (MAJ-B fix — adapter consolidation).
    // HandoffModule imports SessionsModule so HandoffOrchestratorService receives the
    // SAME ClaudeCodeAdapter singleton as SessionManager. This eliminates the separate
    // childProcessMap instance that caused orphan child processes under Task 3.6.
    // SessionsModule exports IAGENT_RUNTIME, so no local provider is needed here.
  ],
  exports: [
    HandoffContextBuilder,
    HandoffOrchestratorService,
    SessionLogPathResolver,
  ],
})
export class HandoffModule {}
