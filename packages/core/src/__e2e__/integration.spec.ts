/**
 * integration.spec.ts — E2E Phase 3 Integration (Task 3.11)
 *
 * Exercises the full Phase 3 wiring with real Nest DI graph + real Prisma SQLite:
 *   OTEL span ingestion → ContextBudgetService threshold → session.force-handoff event
 *   → SessionManager._handleForceHandoff → graceful stdin write → session.ended
 *   → HandoffOrchestrator → DB persist → adapter.spawn(seedPrompt)
 *
 * TEST RUNNER: Jest (this project uses Jest for @orch/core — confirmed by package.json).
 *
 * INVARIANTS:
 *   I-1: No LLM SDK imports. Adapter is a fake; fire-synthetic-span uses no LLM SDK.
 *   I-2: TEST_PROJECT_ID = 'e2e-phase3-int-project' (no "stockforge").
 *   I-6: autoHandoff: true is pre-authorization via profile config (standing confirm).
 *   I-13: Per-suite SQLite tmpdir; full afterAll cleanup including WAL+SHM.
 *   I-15: Token attributes flow via fire-synthetic-span → ATTR_GEN_AI_INPUT_TOKENS.
 *
 * A3 PATH CHOICE: Path B (private-field injection via active-map).
 *   Rationale: Path A (real runSession() with controlled PassThrough lifetime) requires
 *   keeping the fake stdout open until A3 fires its assertion, creating a tight race
 *   between the handoff chain (A4/A5) and executeSession's finally block. Path B is
 *   simpler: inject fake ActiveSessionState directly, emit forceHandoff, assert writeStdin.
 *   Precedent: context-budget.service.ts:282-292 (private-cache access pattern).
 *   This coupling is deliberate test-only (comment at the injection site).
 *
 * A4/A5 APPROACH: Direct session.ended emission.
 *   After verifying A3 (writeStdin via _handleGracefulEnd), we emit session.ended directly
 *   with a properly-formed session object containing endedAt: new Date(). This matches
 *   handoff-orchestrator.integration.spec.ts:261-263 (the documented test pattern for
 *   HandoffOrchestrator). A4/A5 verify the HandoffOrchestrator pipeline
 *   (session.ended → build → persist → spawn) as a separate concern from A3's
 *   SessionManager writeStdin path.
 *
 * SCENARIO B: Separate describe with its own beforeAll/afterAll (narrow module).
 *   Avoids 3s real-timer cron wait inflating Scenario A time.
 *   Mirrors scheduler.integration.spec.ts pattern exactly.
 *
 * STABLE SUBSTRING (A5):
 *   '# Handoff Context' — from prompt-renderer.ts:44 (renderHeader, never truncated).
 *   Always present in every rendered handoff prompt.
 *
 * R1 LOCATION: Nested inside Scenario A's describe so it can access the suite-level
 *   prisma + injectedSessionId variables set in beforeAll.
 */

import 'reflect-metadata';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  context,
  propagation,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

import { AppModule } from '../app.module.js';
import { PrismaService } from '../modules/db/prisma.service.js';
import { IAGENT_RUNTIME } from '../modules/sessions/agent-runtime.token.js';
import { EventBusService } from '../modules/events/event-bus.service.js';
import { EVENT_CHANNELS } from '../modules/events/event-channels.js';
import { ContextBudgetService } from '../modules/context-budget/context-budget.service.js';
import { ContextBudgetSpanProcessor } from '../modules/context-budget/context-budget.span-processor.js';
import { SessionManager } from '../modules/sessions/session-manager.js';
import { BoundedStdoutBuffer } from '../modules/sessions/claude-code-adapter.js';
import { resetOrchContextForTest } from '../domain/context.js';
import { SessionState } from '../domain/session.js';
import { EndedReason } from '@orch/shared';
import type { Session } from '../domain/session.js';
import type { IAgentRuntime, RuntimeHandle, SpawnConfig } from '../domain/types/runtime.js';
import type { SessionContextNearLimitPayload, SessionForceHandoffPayload } from '../modules/context-budget/context-budget.types.js';

// Scheduler-related imports for Scenario B
import { QueueRepository } from '../modules/queue/queue.repository.js';
import { QueueService } from '../modules/queue/queue.service.js';
import { ProjectRegistryService } from '../modules/project-registry/project-registry.service.js';
import { TracingService } from '../modules/tracing/tracing.service.js';
import { SchedulerService } from '../modules/scheduler/scheduler.service.js';
import { QueueItemState } from '../domain/queue-item.js';
import type { Profile } from '../domain/profile.js';

import { fireSyntheticSpan } from '../../test/helpers/fire-synthetic-span.js';

// ── Stable substring (A5) ──────────────────────────────────────────────────────
// renderHeader() in prompt-renderer.ts:44 always produces '# Handoff Context\n'.
// This header is never truncated — present in every rendered handoff prompt.
// Source: packages/core/src/modules/handoff/prompt-renderer.ts:44
const HANDOFF_RENDERED_HEADER_MARKER = '# Handoff Context';

// ── Migration loader ───────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.join(__dirname, '../../prisma/migrations');

function readAllMigrations(): string {
  const migrationFolders = fs
    .readdirSync(MIGRATIONS_DIR)
    .sort()
    .filter((d) => fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory());
  return migrationFolders
    .map((folder) =>
      fs.readFileSync(
        path.join(MIGRATIONS_DIR, folder, 'migration.sql'),
        'utf8',
      ),
    )
    .join('\n');
}

function createTestDb(suffix: string): string {
  const tmp = path.join(
    os.tmpdir(),
    `orch-e2e-ph3-${suffix}-${process.pid}-${Date.now()}.db`,
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database =
    require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
}

// ── FakeRuntimeAdapter ─────────────────────────────────────────────────────────

interface FakeRuntimeAdapter {
  runtime: IAgentRuntime;
  spawnConfigs: SpawnConfig[];
  stdinWrites: Array<{ handleId: string; text: string }>;
}

function makeFakeRuntime(): FakeRuntimeAdapter {
  const spawnConfigs: SpawnConfig[] = [];
  const stdinWrites: Array<{ handleId: string; text: string }> = [];

  const runtime: IAgentRuntime = {
    spawn: jest.fn((config: SpawnConfig) => {
      spawnConfigs.push(config);
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      process.nextTick(() => {
        stdout.end();
        stderr.end();
      });
      return Promise.resolve<RuntimeHandle>({
        sessionId: `fake-spawn-${spawnConfigs.length}`,
        pid: 9900 + spawnConfigs.length,
        abort: jest.fn(),
        stdout,
        stderr,
      });
    }),
    resume: jest.fn().mockImplementation(() => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      process.nextTick(() => { stdout.end(); stderr.end(); });
      return Promise.resolve<RuntimeHandle>({
        sessionId: 'fake-resume-1',
        pid: 9800,
        abort: jest.fn(),
        stdout,
        stderr,
      });
    }),
    terminate: jest.fn().mockResolvedValue(undefined),
    awaitAndClassify: jest.fn().mockResolvedValue(undefined),
    writeStdin: jest.fn((handle: RuntimeHandle, text: string) => {
      stdinWrites.push({ handleId: handle.sessionId, text });
      return Promise.resolve();
    }),
  };

  return { runtime, spawnConfigs, stdinWrites };
}

// ── Scenario B: StubProjectRegistryService ────────────────────────────────────

class StubProjectRegistryService {
  private profiles: Profile[] = [];

  setProfiles(profiles: Profile[]): void {
    this.profiles = profiles;
  }

  listProjects(): Promise<Profile[]> {
    return Promise.resolve(this.profiles);
  }

  getProject(projectId: string): Promise<Profile | undefined> {
    return Promise.resolve(this.profiles.find((p) => p.projectId === projectId));
  }
}

class StubTracingService {
  async withSpan<T>(
    _name: string,
    fn: (span: {
      setAttribute: () => void;
      setStatus: () => void;
      recordException: () => void;
      addEvent: () => void;
      end: () => void;
    }) => Promise<T>,
  ): Promise<T> {
    return fn({
      setAttribute: () => undefined,
      setStatus: () => undefined,
      recordException: () => undefined,
      addEvent: () => undefined,
      end: () => undefined,
    });
  }
}

function makeScenarioBProfile(projectId: string, rootPath: string): Profile {
  return {
    projectId,
    rootPath,
    sessionTypes: [{ name: 'impl', promptTemplate: 'Implement: {{plan}}', maxConcurrent: 1 }],
    hookTargets: [],
    queueSources: [],
    ccsProfile: 'test',
    maxConcurrentSessions: 1,
    langfuseEnabled: false,
    disableSecretRedaction: false,
    contextBudget: { warnAtTokens: 200_000, forceHandoffAtTokens: 230_000 },
    autoHandoff: false,
    gracefulEndTimeoutMs: 30_000,
    commands: {},
    // 6-field every-second cron (real timers compatible — scheduler.integration.spec.ts:18-23)
    cron: { 'phase3-test-job': '* * * * * *' },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO A — Context Overflow → Handoff Chain (full AppModule + real SQLite)
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E Phase 3 Integration (Task 3.11)', () => {

  describe('Scenario A — context overflow → handoff chain', () => {
    /** Must NOT be "stockforge" (I-2). */
    const TEST_PROJECT_ID = 'e2e-phase3-int-project';
    const BASE_SESSION_KEY = `${TEST_PROJECT_ID}:default:e2e-phase3-scenario-a`;
    const SESSION_KEY_A = `${BASE_SESSION_KEY}-chain`;

    let module: TestingModule;
    let app: NestFastifyApplication;
    let testDbPath: string;
    let orchHome: string;
    let projectRoot: string;
    let prisma: PrismaService;
    let eventBus: EventBusService;
    let contextBudgetService: ContextBudgetService;
    let sessionManager: SessionManager;
    let fakeAdapter: FakeRuntimeAdapter;
    let otelProvider: NodeTracerProvider;
    let otelExporter: InMemorySpanExporter;
    let tracer: ReturnType<NodeTracerProvider['getTracer']>;

    /** Captured event sequence for ordering check (A2). */
    const capturedBudgetEvents: Array<{ type: 'near' | 'force'; payload: unknown }> = [];

    /** Session ID created in beforeAll, used across A3–A5 and R1. */
    let injectedSessionId: string;

    /**
     * Promise that resolves when session.handoffApplied fires for TEST_PROJECT_ID
     * with autoHandoff: true. Set up in beforeAll so it's ready before A4 triggers
     * the chain (A5 awaits this — can't register in A5 because A4 may already have
     * fired handoffApplied before A5's test body runs).
     */
    let handoffAppliedPromise: Promise<void>;

    beforeAll(async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

      orchHome = path.join(os.tmpdir(), `orch-e2e-ph3-home-${process.pid}-${Date.now()}`);
      projectRoot = path.join(os.tmpdir(), `orch-e2e-ph3-proj-${process.pid}-${Date.now()}`);
      fs.mkdirSync(path.join(orchHome, 'projects'), { recursive: true });
      fs.mkdirSync(projectRoot, { recursive: true });

      // Low thresholds: warnAt=800, forceHandoffAt=1000.
      // autoHandoff: true → autonomous graceful end (I-6 via profile opt-in).
      // gracefulEndTimeoutMs: 2000 → short for A3 timing.
      // commands.sessionEnd: /session-end → stdin write assertion in A3.
      const profileYaml = [
        `projectId: ${TEST_PROJECT_ID}`,
        `rootPath: "${projectRoot.replace(/\\/g, '/')}"`,
        `ccsProfile: default`,
        `sessionTypes:`,
        `  - name: default`,
        `    promptTemplate: "Implement: {{plan}}"`,
        `contextBudget:`,
        `  warnAtTokens: 800`,
        `  forceHandoffAtTokens: 1000`,
        `autoHandoff: true`,
        `gracefulEndTimeoutMs: 2000`,
        `commands:`,
        `  sessionEnd: "/session-end"`,
      ].join('\n');

      fs.writeFileSync(
        path.join(orchHome, 'projects', `${TEST_PROJECT_ID}.yaml`),
        profileYaml,
        'utf8',
      );

      testDbPath = createTestDb('sca');
      process.env['DATABASE_URL'] = `file:${testDbPath}`;
      process.env['ORCH_HOOK_SECRET'] = 'e2e-ph3-hook-secret';
      process.env['ORCH_API_BEARER_TOKEN'] = 'e2e-ph3-bearer-token';
      process.env['ORCH_HOME'] = orchHome;
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://127.0.0.1:1';

      fakeAdapter = makeFakeRuntime();

      module = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useFactory({ factory: () => new PrismaService() })
        .overrideProvider(IAGENT_RUNTIME)
        .useValue(fakeAdapter.runtime)
        .compile();

      app = module.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter(),
      );

      prisma = module.get(PrismaService);
      eventBus = module.get(EventBusService);
      contextBudgetService = module.get(ContextBudgetService);
      sessionManager = module.get(SessionManager);

      await prisma.onModuleInit();

      await prisma.project.create({
        data: {
          id: TEST_PROJECT_ID,
          rootPath: projectRoot,
          profileJson: JSON.stringify({ projectId: TEST_PROJECT_ID }),
        },
      });

      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      // ── OTEL provider with ContextBudgetSpanProcessor ────────────────────────
      // TracingModule skips ContextBudgetSpanProcessor in JEST_WORKER_ID env
      // (tracing.module.ts:106-111). We manually wire it here on our test provider.
      otelExporter = new InMemorySpanExporter();
      otelProvider = new NodeTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(otelExporter)],
      });
      otelProvider.addSpanProcessor(new ContextBudgetSpanProcessor(contextBudgetService));
      otelProvider.register({ propagator: new W3CTraceContextPropagator() });

      tracer = otelProvider.getTracer('e2e-phase3-integration');

      // Capture all budget events into ordered array for A2 ordering check.
      eventBus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => {
        capturedBudgetEvents.push({ type: 'near', payload: p });
      });
      eventBus.on(EVENT_CHANNELS.session.forceHandoff, (p) => {
        capturedBudgetEvents.push({ type: 'force', payload: p });
      });

      // Set up handoffApplied promise EARLY (before A4 triggers the chain).
      // A5 awaits this — cannot register in A5's test body because A4 may have
      // already fired handoffApplied by the time A5's test function starts.
      handoffAppliedPromise = new Promise<void>((resolve) => {
        const unsub = eventBus.on(EVENT_CHANNELS.session.handoffApplied, (p) => {
          const payload = p as { projectId: string; autoHandoff: boolean };
          if (payload.projectId === TEST_PROJECT_ID && payload.autoHandoff === true) {
            unsub();
            resolve();
          }
        });
      });

      // Create DB Session record for Path B injection.
      const sessionRecord = await prisma.session.create({
        data: {
          projectId: TEST_PROJECT_ID,
          sessionKey: SESSION_KEY_A,
          state: 'Running',
        },
      });
      injectedSessionId = sessionRecord.id;

      // ── Path B: Inject fake ActiveSessionState ───────────────────────────────
      //
      // E2E test-only coupling: see plan §C.1 A3, Path B decision.
      // Precedent: context-budget.service.ts:282-292.
      //
      // We inject directly into SessionManager.active (private Map) so
      // _handleForceHandoff can find SESSION_KEY_A and call _handleGracefulEnd,
      // which writes /session-end to stdin.
      const fakeHandle: RuntimeHandle = {
        sessionId: injectedSessionId,
        pid: 9999,
        abort: jest.fn(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      };

      const fakeActiveState = {
        id: injectedSessionId,
        projectId: TEST_PROJECT_ID,
        sessionKey: SESSION_KEY_A,
        startedAt: Date.now(),
        lastHeartbeatAt: null,
        handle: fakeHandle,
        terminating: false,
        stdoutBuf: new BoundedStdoutBuffer(),
        gracefulEndResolve: null as (() => void) | null,
      };

      // Private-field injection (E2E test-only coupling — Path B)
      (sessionManager as unknown as {
        active: Map<string, typeof fakeActiveState>;
      }).active.set(SESSION_KEY_A, fakeActiveState);
    }, 45_000);

    afterAll(async () => {
      try { await app.close(); } catch { /* ignore */ }

      otelExporter.reset();
      await otelProvider.forceFlush();
      await otelProvider.shutdown();
      // I-13: OTEL global teardown (round-trip.spec.ts:271-276 pattern)
      trace.disable();
      propagation.disable();
      context.disable();

      resetOrchContextForTest();
      jest.restoreAllMocks();

      delete process.env['DATABASE_URL'];
      delete process.env['ORCH_HOOK_SECRET'];
      delete process.env['ORCH_API_BEARER_TOKEN'];
      delete process.env['ORCH_HOME'];
      delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

      // I-13: WAL+SHM cleanup (round-trip.spec.ts:286-289 pattern)
      try { fs.unlinkSync(testDbPath); } catch { /* ignore */ }
      try { fs.unlinkSync(`${testDbPath}-wal`); } catch { /* ignore */ }
      try { fs.unlinkSync(`${testDbPath}-shm`); } catch { /* ignore */ }
      try { fs.rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      try { fs.rmSync(orchHome, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    // ── A1 ────────────────────────────────────────────────────────────────────

    it('A1: synthetic spans crossing warn threshold emit session.context-near-limit', async () => {
      // Register listener BEFORE act-step (proven-safe pattern: latency.spec.ts:478-485).
      const nearLimitPromise = new Promise<SessionContextNearLimitPayload>((resolve) => {
        const unsub = eventBus.on(EVENT_CHANNELS.session.contextNearLimit, (p) => {
          if ((p as SessionContextNearLimitPayload).sessionKey === SESSION_KEY_A) {
            unsub();
            resolve(p as SessionContextNearLimitPayload);
          }
        });
      });

      // Span 1: 400 → total 400 (no event)
      // Span 2: 401 → total 801 (crosses warnAtTokens: 800)
      fireSyntheticSpan(tracer, SESSION_KEY_A, TEST_PROJECT_ID, 400);
      fireSyntheticSpan(tracer, SESSION_KEY_A, TEST_PROJECT_ID, 401);

      const nearPayload = await nearLimitPromise;

      expect(nearPayload.sessionKey).toBe(SESSION_KEY_A);
      expect(nearPayload.projectId).toBe(TEST_PROJECT_ID);
      expect(nearPayload.currentTokens).toBe(801);
      expect(nearPayload.threshold).toBe(800);
    }, 10_000);

    // ── A2 ────────────────────────────────────────────────────────────────────

    it('A2: synthetic spans crossing force threshold emit session.force-handoff', async () => {
      const forceHandoffPromise = new Promise<SessionForceHandoffPayload>((resolve) => {
        const unsub = eventBus.on(EVENT_CHANNELS.session.forceHandoff, (p) => {
          if ((p as SessionForceHandoffPayload).sessionKey === SESSION_KEY_A) {
            unsub();
            resolve(p as SessionForceHandoffPayload);
          }
        });
      });

      // 200 tokens → total 1001 (crosses forceHandoffAtTokens: 1000)
      fireSyntheticSpan(tracer, SESSION_KEY_A, TEST_PROJECT_ID, 200);

      const forcePayload = await forceHandoffPromise;

      expect(forcePayload.sessionKey).toBe(SESSION_KEY_A);
      expect(forcePayload.projectId).toBe(TEST_PROJECT_ID);
      expect(forcePayload.currentTokens).toBe(1001);
      expect(forcePayload.threshold).toBe(1000);

      // Order check: near-limit MUST precede force-handoff in captured array (A2 spec).
      const nearIdx = capturedBudgetEvents.findIndex(
        (e) => e.type === 'near' &&
          (e.payload as SessionContextNearLimitPayload).sessionKey === SESSION_KEY_A,
      );
      const forceIdx = capturedBudgetEvents.findIndex(
        (e) => e.type === 'force' &&
          (e.payload as SessionForceHandoffPayload).sessionKey === SESSION_KEY_A,
      );
      expect(nearIdx).toBeGreaterThanOrEqual(0);
      expect(forceIdx).toBeGreaterThan(nearIdx);
    }, 10_000);

    // ── A3 ────────────────────────────────────────────────────────────────────

    it('A3: SessionManager invokes adapter.writeStdin with /session-end\\n', async () => {
      // The force-handoff event fired in A2 triggered _handleForceHandoff (async void).
      // Because autoHandoff: true and SESSION_KEY_A is in active map (Path B injection),
      // _handleGracefulEnd is called, which writes sessionEndCommand + '\n' to stdin.
      //
      // Poll fakeAdapter.stdinWrites with 5s deadline (well before gracefulEndTimeoutMs).

      const deadline = Date.now() + 5000;
      let found = false;
      while (Date.now() < deadline) {
        if (fakeAdapter.stdinWrites.some((w) => w.text === '/session-end\n')) {
          found = true;
          break;
        }
        await wait(50);
      }

      expect(found).toBe(true);
      const stdinEntry = fakeAdapter.stdinWrites.find((w) => w.text === '/session-end\n');
      expect(stdinEntry).toBeDefined();
      expect(stdinEntry!.text).toBe('/session-end\n');
    }, 10_000);

    // ── A4 ────────────────────────────────────────────────────────────────────

    it('A4: HandoffContext row persisted via Path B (post-commit transaction)', async () => {
      // A4 verifies the session.ended → _handleContextFullEnd → build → persist → handoffPrepared
      // chain (separate from A3's SessionManager writeStdin concern).
      // Real eventBus.emit path used — Date passthrough bug fixed in redact-log-object.ts.

      const handoffSession: Session = {
        id: injectedSessionId,
        projectId: TEST_PROJECT_ID,
        sessionKey: SESSION_KEY_A,
        state: SessionState.Ended,
        createdAt: new Date(),
        updatedAt: new Date(),
        endedAt: new Date(),
        endReason: EndedReason.ContextFull,
      };

      // Register listener BEFORE emitting (proven-safe pattern).
      const handoffPreparedPromise = new Promise<{ handoffId: string }>((resolve) => {
        const unsub = eventBus.on(EVENT_CHANNELS.session.handoffPrepared, (p) => {
          const payload = p as { handoffId: string; sessionId: string };
          if (payload.sessionId === injectedSessionId) {
            unsub();
            resolve({ handoffId: payload.handoffId });
          }
        });
      });

      // Act: use the real EventBusService.emit path (Date passthrough fix landed).
      eventBus.emit(EVENT_CHANNELS.session.ended, {
        session: handoffSession,
        endReason: EndedReason.ContextFull,
      });

      const { handoffId } = await handoffPreparedPromise;

      // Assert: DB row exists
      const row = await prisma.handoffContext.findFirst({
        where: { fromSessionId: injectedSessionId },
      });

      expect(row).not.toBeNull();
      expect(row!.id).toBe(handoffId);
      expect(row!.seedPrompt).toBeTruthy();
      expect(row!.seedPrompt.length).toBeGreaterThan(0);
      // Status is READY_FOR_AUTO_SPAWN (autoHandoff: true) or APPLIED (if spawn already ran)
      expect(['READY_FOR_AUTO_SPAWN', 'APPLIED']).toContain(row!.status);
    }, 15_000);

    // ── A5 ────────────────────────────────────────────────────────────────────

    it('A5: successor session spawned with rendered seedPrompt in SpawnConfig', async () => {
      // HandoffOrchestrator.autoHandoff=true path calls _spawnSuccessor → runtime.spawn().
      // handoffApplied signals spawn completed (decision 008: orchestrator owns spawn).
      //
      // handoffAppliedPromise was registered in beforeAll (before A4 triggered the chain).
      // A4 already fired handoffApplied; await here to confirm it resolved.

      await handoffAppliedPromise;

      // Assert: fake adapter received a spawn call with seedPrompt
      const successorSpawn = fakeAdapter.spawnConfigs.find(
        (cfg) => cfg.seedPrompt !== undefined && cfg.seedPrompt.length > 0,
      );
      expect(successorSpawn).toBeDefined();

      // seedPrompt must contain the stable handoff header
      // Source: prompt-renderer.ts:44 (renderHeader — never truncated)
      expect(successorSpawn!.seedPrompt).toContain(HANDOFF_RENDERED_HEADER_MARKER);

      // Spawn was triggered by HandoffOrchestrator (continuation prompt from _spawnSuccessor)
      expect(successorSpawn!.prompt).toContain('Continue the work');
    }, 15_000);

    // ── A6 (Task 4.1 — real value capture) ────────────────────────────────────
    // Replaces the deleted R1 regression guard. Asserts real commit_sha and
    // session_log_path are persisted on the HandoffContext row.
    // projectRoot is a tmp dir (not a git repo) → getHeadCommit() falls back to null,
    // so commit_sha should be null. session_log_path must end with .md.

    it(
      'A6: HandoffContext row has null commit_sha (non-git projectRoot) and non-null session_log_path ending in .md',
      async () => {
        // Query the HandoffContext row created in A4.
        const row = await prisma.handoffContext.findFirst({
          where: { fromSessionId: injectedSessionId },
          orderBy: { createdAt: 'asc' },
        });

        expect(row).not.toBeNull();

        // commit_sha: projectRoot is a tmp dir (not a git repo) so getHeadCommit()
        // throws, the orchestrator catches and falls back → commit_sha stored as null.
        expect(row!.commit_sha).toBeNull();

        // session_log_path: SessionLogPathResolver always returns a .md path.
        expect(row!.session_log_path).not.toBeNull();
        expect(row!.session_log_path).toMatch(/\.md$/);

        // contextJson: GitDiffCollector degrades gracefully for non-git dirs;
        // the gitDiff.degraded flag should be true.
        const contextJson = JSON.parse(row!.contextJson) as {
          gitDiff?: { degraded?: boolean };
        };
        expect(contextJson.gitDiff?.degraded).toBe(true);
      },
      10_000,
    );

  }); // end Scenario A

  // ─────────────────────────────────────────────────────────────────────────────
  // SCENARIO B — Cron path (narrow module, isolated from handoff chain)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Scenario B — cron path', () => {
    const CRON_PROJECT_ID = 'e2e-phase3-cron-project';
    const CRON_PROJECT_ROOT = '/projects/e2e-phase3-cron';
    const CRON_NAME = 'phase3-test-job';

    let module: TestingModule;
    let prisma: PrismaService;
    let scheduler: SchedulerService;
    let queueRepo: QueueRepository;
    let eventBus: EventBusService;
    let testDbPath: string;

    beforeAll(async () => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

      testDbPath = createTestDb('scb');
      process.env['DATABASE_URL'] = `file:${testDbPath}`;

      const stubRegistry = new StubProjectRegistryService();
      stubRegistry.setProfiles([
        makeScenarioBProfile(CRON_PROJECT_ID, CRON_PROJECT_ROOT),
      ]);

      const emitter = new EventEmitter2({ wildcard: true, maxListeners: 100 });

      module = await Test.createTestingModule({
        providers: [
          PrismaService,
          QueueRepository,
          QueueService,
          SchedulerService,
          { provide: EventBusService, useValue: new EventBusService(emitter) },
          { provide: TracingService, useClass: StubTracingService },
          { provide: ProjectRegistryService, useValue: stubRegistry },
        ],
      }).compile();

      prisma = module.get(PrismaService);
      scheduler = module.get(SchedulerService);
      queueRepo = module.get(QueueRepository);
      eventBus = module.get(EventBusService);

      await prisma.onModuleInit();

      await prisma.project.create({
        data: {
          id: CRON_PROJECT_ID,
          rootPath: CRON_PROJECT_ROOT,
          profileJson: JSON.stringify({ projectId: CRON_PROJECT_ID }),
        },
      });
    }, 30_000);

    afterAll(async () => {
      try { await scheduler.onModuleDestroy(); } catch { /* ignore */ }
      await prisma.onModuleDestroy();
      await module.close();

      jest.restoreAllMocks();

      try { fs.unlinkSync(testDbPath); } catch { /* ignore */ }
      try { fs.unlinkSync(`${testDbPath}-wal`); } catch { /* ignore */ }
      try { fs.unlinkSync(`${testDbPath}-shm`); } catch { /* ignore */ }

      delete process.env['DATABASE_URL'];
    });

    it(
      'B1: cron tick fires SchedulerService.onTick → QueueService.enqueue → DB Pending row + scheduler.tick-fired event',
      async () => {
        // Capture scheduler.tick-fired events.
        const tickFiredEvents: unknown[] = [];
        eventBus.on(EVENT_CHANNELS.scheduler.tickFired, (p) => {
          tickFiredEvents.push(p);
        });

        // Bootstrap scheduler — `* * * * * *` fires every second; first tick in ~1s.
        await scheduler.onModuleInit();

        // Wait up to 3 real seconds (scheduler.integration.spec.ts:240-247 pattern).
        // REAL TIMERS ONLY — fake timers cause Prisma transaction timeout (spec §F.2).
        const deadline = Date.now() + 3000;
        let rows: Awaited<ReturnType<typeof queueRepo.list>> = [];
        while (Date.now() < deadline) {
          await wait(100);
          rows = await queueRepo.list(CRON_PROJECT_ID, QueueItemState.Pending);
          if (rows.length > 0) break;
        }

        // Assert: DB has at least one Pending QueueItem with correct planPath.
        expect(rows.length).toBeGreaterThanOrEqual(1);
        const row = rows[0]!;
        expect(row.payload['planPath']).toMatch(
          /session-plans[/\\]pending[/\\]phase3-test-job\.md$/,
        );

        // Assert: scheduler.tick-fired event emitted with correct projectId + cronName.
        expect(tickFiredEvents.length).toBeGreaterThanOrEqual(1);
        const event = tickFiredEvents[0] as {
          projectId: string;
          cronName: string;
          itemId: string;
        };
        expect(event.projectId).toBe(CRON_PROJECT_ID);
        expect(event.cronName).toBe(CRON_NAME);
        expect(event.itemId).toBe(row.id);
      },
      10_000, // 10s timeout (scheduler.integration.spec.ts precedent)
    );
  });

}); // end outer describe
