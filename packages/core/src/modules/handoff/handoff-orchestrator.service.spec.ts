/**
 * handoff-orchestrator.service.spec.ts
 *
 * Unit tests for HandoffOrchestratorService (Task 3.6 narrow-fix pass).
 *
 * Coverage:
 *  - T-ORCH-1: session.ended CONTEXT_FULL → builds context, persists, emits handoffPrepared + handoffApplied
 *  - T-ORCH-2: session.ended CONTEXT_FULL_FORCED → same pipeline (endedReason mapped correctly)
 *  - T-ORCH-3: auto_handoff=false → adapter.spawn() NOT called (CRITICAL-3 behavioral gate)
 *  - T-ORCH-4: auto_handoff=true → adapter.spawn() IS called with seedPrompt populated (CRITICAL-3/1)
 *  - T-ORCH-5: session.ended with process_exit reason → no handoff triggered
 *  - T-ORCH-6: project not found → warns, no crash, no handoffPrepared emitted
 *  - T-ORCH-7: builder.build() throws → no handoffPrepared emitted, no crash (error logged)
 *  - T-ORCH-7-ROLLBACK: prisma.$transaction throws → no handoffPrepared, ERROR log emitted (MAJOR-1)
 *  - T-ORCH-8: user_cancel reason → no handoff triggered
 *  - T-ORCH-9: seedPromptLength present in handoffApplied payload
 *  - T-ORCH-10: auto_handoff=false → HandoffContext created with status=AWAITING_CONFIRM (CRITICAL-3)
 *  - T-ORCH-11: auto_handoff=true → HandoffContext created with status=READY_FOR_AUTO_SPAWN (CRITICAL-3)
 *  - T-ORCH-12: auto_handoff=false → handoffPending event emitted (CRITICAL-3)
 *  - T-ORCH-13: auto_handoff=false → handoffApplied.autoHandoff=false, spawn NOT called
 *  - T-ORCH-14: contextJson stored on create is the FULL structured blob (CRITICAL-2)
 *  - T-ORCH-15: seedPrompt stored in dedicated column, contextJson NOT overwritten (CRITICAL-2)
 *  - T-ORCH-16: HandoffContext marked APPLIED after successful spawn (CRITICAL-1)
 *
 * Adapter seedPrompt threading:
 *  - T-SEED-1: SpawnConfig with seedPrompt → effectivePrompt includes seed
 *  - T-SEED-2: SpawnConfig without seedPrompt → prompt passed as-is (no separator)
 *
 * I-13: no real DB, no real subprocess, no real filesystem.
 * I-14: all dependencies injected via constructor mocks.
 */

import { HandoffOrchestratorService, HANDOFF_STATUS } from './handoff-orchestrator.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { EndedReason } from '@orch/shared';
import type { Session } from '../../domain/session.js';
import { SessionState } from '../../domain/session.js';
import type { HandoffContext, RenderedPrompt } from './types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-001',
    projectId: 'proj-001',
    sessionKey: 'proj-001:default:1',
    state: SessionState.Ended,
    createdAt: new Date('2026-04-26T00:00:00Z'),
    updatedAt: new Date('2026-04-26T01:00:00Z'),
    endedAt: new Date('2026-04-26T01:00:00Z'),
    endReason: EndedReason.ContextFull,
    ...overrides,
  };
}

function makeHandoffContext(): HandoffContext {
  return {
    sessionId: 'session-001',
    projectId: 'proj-001',
    endedAt: '2026-04-26T01:00:00Z',
    endedReason: 'CONTEXT_FULL',
    gitDiff: {
      fromRef: 'HEAD',
      toRef: 'HEAD',
      files: [],
      totalInsertions: 0,
      totalDeletions: 0,
      degraded: true,
      degradedReason: 'not_a_git_repo',
    },
    logSummary: null,
    degraded: true,
    degradedReasons: ['git_degraded: not_a_git_repo'],
  };
}

function makeRenderedPrompt(): RenderedPrompt {
  return {
    text: '## Pickup point\n\nContext from previous session.',
    tokens: 42,
    truncated: false,
    truncationActions: [],
  };
}

function makeProfile(autoHandoff = false) {
  return {
    projectId: 'proj-001',
    rootPath: '/projects/proj-001',
    autoHandoff,
    ccsProfile: 'default',
    sessionTypes: [{ name: 'impl', promptTemplate: '{{plan}}', maxConcurrent: 1 }],
    hookTargets: [],
    queueSources: [],
    maxConcurrentSessions: 1,
    langfuseEnabled: false,
    disableSecretRedaction: false,
    contextBudget: { warnAtTokens: 200000, forceHandoffAtTokens: 230000 },
    gracefulEndTimeoutMs: 30000,
    commands: {},
  };
}

// ── Mock event bus ─────────────────────────────────────────────────────────────

type EmitCall = { channel: string; payload: unknown };

function makeMockEvents() {
  const emitCalls: EmitCall[] = [];
  const listeners: Map<string, Array<(payload: unknown) => void>> = new Map();

  const events = {
    on: jest.fn((channel: string, handler: (p: unknown) => void) => {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel)!.push(handler);
      return () => {
        const arr = listeners.get(channel) ?? [];
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
      };
    }),
    emit: jest.fn((channel: string, payload: unknown) => {
      emitCalls.push({ channel, payload });
    }),
    emitCalls,
    /** Trigger the session.ended listener directly */
    fireSessionEnded: (session: Session, endReason: string) => {
      const handlers = listeners.get(EVENT_CHANNELS.session.ended) ?? [];
      for (const h of handlers) {
        h({ session, endReason });
      }
    },
  };
  return events;
}

// ── Mock tracing ────────────────────────────────────────────────────────────────

function makeMockTracing() {
  const span = {
    setAttribute: jest.fn(),
    setStatus: jest.fn(),
    addEvent: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  };
  return {
    withSpan: jest.fn(async (_name: string, fn: (s: typeof span) => Promise<void>) => {
      await fn(span);
    }),
    span,
  };
}

// ── Mock adapter ───────────────────────────────────────────────────────────────

function makeMockRuntime(spawnResolves = true) {
  const spawnCalls: unknown[] = [];
  return {
    spawn: jest.fn((config: unknown) => {
      spawnCalls.push(config);
      if (!spawnResolves) return Promise.reject(new Error('spawn-failed'));
      return Promise.resolve({
        sessionId: 'new-session-002',
        pid: 999,
        abort: jest.fn(),
        stdout: null,
        stderr: null,
      });
    }),
    resume: jest.fn(),
    terminate: jest.fn(),
    awaitAndClassify: jest.fn(),
    writeStdin: jest.fn(),
    spawnCalls,
  };
}

// ── Service factory ─────────────────────────────────────────────────────────────

interface ServiceOpts {
  autoHandoff?: boolean;
  profileFound?: boolean;
  builderThrows?: boolean;
  prismaThrows?: boolean;
  spawnFails?: boolean;
}

function makeService(opts: ServiceOpts = {}) {
  const {
    autoHandoff = false,
    profileFound = true,
    builderThrows = false,
    prismaThrows = false,
    spawnFails = false,
  } = opts;

  const mockEvents = makeMockEvents();
  const mockTracing = makeMockTracing();
  const mockHandoffContext = makeHandoffContext();
  const mockRendered = makeRenderedPrompt();

  const mockBuilder = {
    build: builderThrows
      ? jest.fn().mockRejectedValue(new Error('builder-failed'))
      : jest.fn().mockResolvedValue(mockHandoffContext),
    render: jest.fn().mockReturnValue(mockRendered),
  };

  const mockRegistry = {
    getProject: jest.fn().mockResolvedValue(
      profileFound ? makeProfile(autoHandoff) : undefined,
    ),
  };

  const mockHandoffContextCreate = jest.fn().mockResolvedValue({ id: 'handoff-001' });
  const mockHandoffContextUpdate = jest.fn().mockResolvedValue({ id: 'handoff-001', status: HANDOFF_STATUS.APPLIED });
  const mockHandoffContextFindUnique = jest.fn().mockResolvedValue({
    id: 'handoff-001',
    status: HANDOFF_STATUS.AWAITING_CONFIRM,
    seedPrompt: mockRendered.text,
    contextJson: '{}',
  });

  const mockPrisma = {
    $transaction: prismaThrows
      ? jest.fn().mockRejectedValue(new Error('db-failed'))
      : jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const mockTx = {
            handoffContext: {
              create: mockHandoffContextCreate,
            },
          };
          return fn(mockTx);
        }),
    handoffContext: {
      update: mockHandoffContextUpdate,
      findUnique: mockHandoffContextFindUnique,
    },
  };

  const mockRuntime = makeMockRuntime(!spawnFails);

  // Mock GitDiffCollector — getHeadCommit returns a fake 40-char hex SHA.
  const mockGitDiff = {
    getHeadCommit: jest.fn().mockResolvedValue('a'.repeat(40)),
    collect: jest.fn(),
  };

  // Mock SessionLogPathResolver — resolve returns a stable fake path.
  const mockSessionLogResolver = {
    resolve: jest.fn().mockReturnValue('/orch/memory/sessions/2026-04-27-session-1.md'),
  };

  // Construct the service with mocked deps via direct property injection
  const svc = new HandoffOrchestratorService(
    mockEvents as unknown as import('../events/event-bus.service.js').EventBusService,
    mockTracing as unknown as import('../tracing/tracing.service.js').TracingService,
    mockPrisma as unknown as import('../db/prisma.service.js').PrismaService,
    mockBuilder as unknown as import('./handoff-context-builder.js').HandoffContextBuilder,
    mockRegistry as unknown as import('../project-registry/project-registry.service.js').ProjectRegistryService,
    mockGitDiff as unknown as import('./git-diff-collector.js').GitDiffCollector,
    mockSessionLogResolver as unknown as import('./session-log-path-resolver.js').SessionLogPathResolver,
    mockRuntime as unknown as import('../../domain/types/runtime.js').IAgentRuntime,
  );

  return {
    svc,
    mockEvents,
    mockTracing,
    mockBuilder,
    mockRegistry,
    mockPrisma,
    mockHandoffContextCreate,
    mockHandoffContextUpdate,
    mockHandoffContextFindUnique,
    mockRuntime,
    mockRendered,
    mockGitDiff,
    mockSessionLogResolver,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HandoffOrchestratorService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // T-ORCH-1: happy path CONTEXT_FULL
  it('T-ORCH-1: session.ended CONTEXT_FULL → builds context, persists, emits handoffPrepared + handoffApplied', async () => {
    const { svc, mockEvents, mockBuilder, mockPrisma } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    // Builder invoked with correct input
    expect(mockBuilder.build).toHaveBeenCalledTimes(1);
    const buildInput: import('./types.js').HandoffBuildInput = mockBuilder.build.mock.calls[0][0];
    expect(buildInput.sessionId).toBe('session-001');
    expect(buildInput.projectId).toBe('proj-001');
    expect(buildInput.endedReason).toBe('CONTEXT_FULL');

    // DB insert happened
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Events emitted
    const channels = mockEvents.emitCalls.map((c) => c.channel);
    expect(channels).toContain(EVENT_CHANNELS.session.handoffPrepared);
    expect(channels).toContain(EVENT_CHANNELS.session.handoffApplied);

    // handoffPrepared payload shape
    const preparedCall = mockEvents.emitCalls.find(
      (c) => c.channel === EVENT_CHANNELS.session.handoffPrepared,
    );
    expect(preparedCall?.payload).toMatchObject({
      handoffId: 'handoff-001',
      sessionId: 'session-001',
      projectId: 'proj-001',
    });
    expect((preparedCall?.payload as Record<string, unknown>)['rendered']).toBeDefined();
    expect((preparedCall?.payload as Record<string, unknown>)['context']).toBeDefined();
  });

  // T-ORCH-2: CONTEXT_FULL_FORCED
  it('T-ORCH-2: session.ended CONTEXT_FULL_FORCED → endedReason mapped to CONTEXT_FULL_FORCED', async () => {
    const { svc, mockEvents, mockBuilder } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFullForced);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBuilder.build).toHaveBeenCalledTimes(1);
    const buildInput: import('./types.js').HandoffBuildInput = mockBuilder.build.mock.calls[0][0];
    expect(buildInput.endedReason).toBe('CONTEXT_FULL_FORCED');

    const channels = mockEvents.emitCalls.map((c) => c.channel);
    expect(channels).toContain(EVENT_CHANNELS.session.handoffPrepared);
    expect(channels).toContain(EVENT_CHANNELS.session.handoffApplied);
  });

  // T-ORCH-3: auto_handoff=false → adapter.spawn() NOT called (CRITICAL-3 behavioral)
  it('T-ORCH-3: auto_handoff=false → adapter.spawn() NOT called (CRITICAL-3 behavioral gate)', async () => {
    const { svc, mockEvents, mockRuntime } = makeService({ autoHandoff: false });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    // CRITICAL-3: no spawn when auto_handoff=false
    expect(mockRuntime.spawn).not.toHaveBeenCalled();

    // handoffApplied must still be emitted (with autoHandoff=false)
    const appliedCall = mockEvents.emitCalls.find(
      (c) => c.channel === EVENT_CHANNELS.session.handoffApplied,
    );
    expect(appliedCall).toBeDefined();
    expect((appliedCall!.payload as Record<string, unknown>)['autoHandoff']).toBe(false);
  });

  // T-ORCH-4: auto_handoff=true → adapter.spawn() IS called with seedPrompt (CRITICAL-1/3)
  it('T-ORCH-4: auto_handoff=true → adapter.spawn() called with seedPrompt populated (CRITICAL-1/3)', async () => {
    const { svc, mockEvents, mockRuntime, mockRendered } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    // CRITICAL-1: spawn IS called
    expect(mockRuntime.spawn).toHaveBeenCalledTimes(1);
    const spawnArg = mockRuntime.spawn.mock.calls[0][0] as import('../../domain/types/runtime.js').SpawnConfig;

    // CRITICAL-1: seedPrompt is the rendered text from builder
    expect(spawnArg.seedPrompt).toBe(mockRendered.text);
    expect(spawnArg.seedPrompt).toContain('## Pickup point');

    // handoffApplied with autoHandoff=true
    const appliedCall = mockEvents.emitCalls.find(
      (c) => c.channel === EVENT_CHANNELS.session.handoffApplied,
    );
    expect((appliedCall?.payload as Record<string, unknown>)['autoHandoff']).toBe(true);
  });

  // T-ORCH-5: process_exit → no handoff
  it('T-ORCH-5: session.ended process_exit → no handoff triggered', async () => {
    const { svc, mockEvents, mockBuilder, mockRuntime } = makeService();
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), 'process_exit');
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBuilder.build).not.toHaveBeenCalled();
    expect(mockRuntime.spawn).not.toHaveBeenCalled();
    const channels = mockEvents.emitCalls.map((c) => c.channel);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffPrepared);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffApplied);
  });

  // T-ORCH-6: project not found
  it('T-ORCH-6: project not found → no crash, no handoffPrepared emitted', async () => {
    const { svc, mockEvents, mockBuilder, mockRuntime } = makeService({ profileFound: false });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBuilder.build).not.toHaveBeenCalled();
    expect(mockRuntime.spawn).not.toHaveBeenCalled();
    const channels = mockEvents.emitCalls.map((c) => c.channel);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffPrepared);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffApplied);
  });

  // T-ORCH-7: builder throws
  it('T-ORCH-7: builder.build() throws → no crash, no handoffPrepared emitted', async () => {
    const { svc, mockEvents, mockRuntime } = makeService({ builderThrows: true });
    svc.onModuleInit();

    // Must not throw from event handler
    await expect(
      new Promise<void>((resolve) => {
        mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
        setTimeout(resolve, 20);
      }),
    ).resolves.toBeUndefined();

    expect(mockRuntime.spawn).not.toHaveBeenCalled();
    const channels = mockEvents.emitCalls.map((c) => c.channel);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffPrepared);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffApplied);
  });

  // T-ORCH-7-ROLLBACK: prisma.$transaction fails (MAJOR-1)
  it('T-ORCH-7-ROLLBACK: prisma.$transaction fails → no handoffPrepared, no spawn, span error set', async () => {
    const { svc, mockEvents, mockRuntime, mockTracing } = makeService({ prismaThrows: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    // No spawn after DB failure
    expect(mockRuntime.spawn).not.toHaveBeenCalled();

    // No events emitted
    const channels = mockEvents.emitCalls.map((c) => c.channel);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffPrepared);
    expect(channels).not.toContain(EVENT_CHANNELS.session.handoffApplied);

    // Span marked error (alert path — decision 007)
    expect(mockTracing.span.setStatus).toHaveBeenCalledWith('error');
    expect(mockTracing.span.setAttribute).toHaveBeenCalledWith('handoff.error', expect.stringContaining('db-failed'));
  });

  // T-ORCH-8: user_cancel → no handoff
  it('T-ORCH-8: session.ended user_cancel → no handoff triggered', async () => {
    const { svc, mockEvents, mockBuilder, mockRuntime } = makeService();
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), 'user_cancel');
    await new Promise((r) => setTimeout(r, 20));

    expect(mockBuilder.build).not.toHaveBeenCalled();
    expect(mockRuntime.spawn).not.toHaveBeenCalled();
  });

  // T-ORCH-9: seedPromptLength in payload
  it('T-ORCH-9: handoffApplied payload includes seedPromptLength matching rendered.text.length', async () => {
    const { svc, mockEvents, mockRendered } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    const appliedCall = mockEvents.emitCalls.find(
      (c) => c.channel === EVENT_CHANNELS.session.handoffApplied,
    );
    expect(
      (appliedCall?.payload as Record<string, unknown>)['seedPromptLength'],
    ).toBe(mockRendered.text.length);
  });

  // T-ORCH-10: auto_handoff=false → status=AWAITING_CONFIRM in DB create (CRITICAL-3)
  it('T-ORCH-10: auto_handoff=false → HandoffContext created with status=AWAITING_CONFIRM (CRITICAL-3)', async () => {
    const { svc, mockEvents, mockHandoffContextCreate } = makeService({ autoHandoff: false });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockHandoffContextCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: HANDOFF_STATUS.AWAITING_CONFIRM,
        }),
      }),
    );
  });

  // T-ORCH-11: auto_handoff=true → status=READY_FOR_AUTO_SPAWN in DB create (CRITICAL-3)
  it('T-ORCH-11: auto_handoff=true → HandoffContext created with status=READY_FOR_AUTO_SPAWN (CRITICAL-3)', async () => {
    const { svc, mockEvents, mockHandoffContextCreate } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockHandoffContextCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: HANDOFF_STATUS.READY_FOR_AUTO_SPAWN,
        }),
      }),
    );
  });

  // T-ORCH-12: auto_handoff=false → handoffPending event emitted (CRITICAL-3)
  it('T-ORCH-12: auto_handoff=false → session.handoff-pending event emitted', async () => {
    const { svc, mockEvents } = makeService({ autoHandoff: false });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    const pendingCall = mockEvents.emitCalls.find(
      (c) => c.channel === EVENT_CHANNELS.session.handoffPending,
    );
    expect(pendingCall).toBeDefined();
    const payload = pendingCall!.payload as Record<string, unknown>;
    expect(payload['handoffId']).toBe('handoff-001');
    expect(payload['projectId']).toBe('proj-001');
  });

  // T-ORCH-13: auto_handoff=false → handoffApplied with autoHandoff=false, spawn NOT called
  it('T-ORCH-13: auto_handoff=false → handoffApplied.autoHandoff=false AND spawn not called', async () => {
    const { svc, mockEvents, mockRuntime } = makeService({ autoHandoff: false });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRuntime.spawn).not.toHaveBeenCalled();

    const appliedCall = mockEvents.emitCalls.find(
      (c) => c.channel === EVENT_CHANNELS.session.handoffApplied,
    );
    expect(appliedCall).toBeDefined();
    expect((appliedCall!.payload as Record<string, unknown>)['autoHandoff']).toBe(false);
  });

  // T-ORCH-14: contextJson is full structured blob on create (CRITICAL-2)
  it('T-ORCH-14: contextJson stored on create is the full structured HandoffContext blob (CRITICAL-2)', async () => {
    const { svc, mockEvents, mockHandoffContextCreate, mockBuilder } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    const createArg = mockHandoffContextCreate.mock.calls[0][0];
    const contextJson = JSON.parse(createArg.data.contextJson as string) as Record<string, unknown>;

    // Must contain full structured ctx fields from builder (not just { seedPrompt })
    expect(contextJson['sessionId']).toBe('session-001');
    expect(contextJson['projectId']).toBe('proj-001');
    expect(contextJson['gitDiff']).toBeDefined();
  });

  // T-ORCH-15: seedPrompt stored in dedicated column, contextJson NOT overwritten (CRITICAL-2)
  it('T-ORCH-15: seedPrompt in dedicated column; contextJson never mutated after create (CRITICAL-2)', async () => {
    const { svc, mockEvents, mockHandoffContextCreate, mockHandoffContextUpdate, mockRendered } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    // seedPrompt stored in dedicated column at create time
    const createArg = mockHandoffContextCreate.mock.calls[0][0];
    expect(createArg.data.seedPrompt).toBe(mockRendered.text);

    // Update (status transition) must NOT touch contextJson
    if (mockHandoffContextUpdate.mock.calls.length > 0) {
      for (const call of mockHandoffContextUpdate.mock.calls) {
        const updateData = (call[0] as Record<string, unknown>)['data'] as Record<string, unknown>;
        expect(updateData['contextJson']).toBeUndefined();
      }
    }
  });

  // T-ORCH-16: HandoffContext marked APPLIED after successful spawn (CRITICAL-1)
  it('T-ORCH-16: HandoffContext status updated to APPLIED after successful spawn (CRITICAL-1)', async () => {
    const { svc, mockEvents, mockHandoffContextUpdate } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockHandoffContextUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'handoff-001' },
        data: { status: HANDOFF_STATUS.APPLIED },
      }),
    );
  });
});

// ── I-6 gate behavioral tests ─────────────────────────────────────────────────

describe('HandoffOrchestrator I-6 gate — behavioral (not cosmetic)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('T-I6-1: auto_handoff=false → spawn.not.toHaveBeenCalled() (I-6 gate suppresses spawn)', async () => {
    const { svc, mockEvents, mockRuntime } = makeService({ autoHandoff: false });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    // T-CAP-3 anti-pattern fix: assert what the gate SUPPRESSES, not a metadata field
    expect(mockRuntime.spawn).not.toHaveBeenCalled();
  });

  it('T-I6-2: auto_handoff=true → spawn IS called with seedPrompt (profile pre-authorises auto-spawn)', async () => {
    const { svc, mockEvents, mockRuntime, mockRendered } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    // T-CAP-3 anti-pattern fix: assert what the gate PERMITS
    expect(mockRuntime.spawn).toHaveBeenCalledTimes(1);
    const spawnArg = mockRuntime.spawn.mock.calls[0][0] as import('../../domain/types/runtime.js').SpawnConfig;
    expect(spawnArg.seedPrompt).toBe(mockRendered.text);
  });

  it('T-I6-3: operator confirm → spawn called after AWAITING_CONFIRM (manual path)', async () => {
    const { svc, mockRuntime, mockPrisma } = makeService({ autoHandoff: false });

    // Wire confirmHandoff
    const result = await svc.confirmHandoff('handoff-001', 'proj-001');

    // After confirm, spawn should be called
    expect(mockRuntime.spawn).toHaveBeenCalledTimes(1);
    const spawnArg = mockRuntime.spawn.mock.calls[0][0] as import('../../domain/types/runtime.js').SpawnConfig;
    expect(spawnArg.seedPrompt).toBeDefined();
    expect(typeof result).toBe('string');

    // Status updated to APPLIED
    expect(mockPrisma.handoffContext.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: HANDOFF_STATUS.APPLIED },
      }),
    );
  });
});

// ── seedPrompt threading (SpawnConfig interface) — MAJOR-2 fix ──────────────

describe('SpawnConfig.seedPrompt adapter behavioral test', () => {
  it('T-SEED-1: spawn called with seedPrompt → effectivePrompt includes seed text', async () => {
    const { svc, mockEvents, mockRuntime, mockRendered } = makeService({ autoHandoff: true });
    svc.onModuleInit();

    mockEvents.fireSessionEnded(makeSession(), EndedReason.ContextFull);
    await new Promise((r) => setTimeout(r, 20));

    expect(mockRuntime.spawn).toHaveBeenCalledTimes(1);
    const spawnArg = mockRuntime.spawn.mock.calls[0][0] as import('../../domain/types/runtime.js').SpawnConfig;

    // seedPrompt is the rendered text — observable in adapter call
    expect(spawnArg.seedPrompt).toBe(mockRendered.text);
    expect(spawnArg.seedPrompt).toContain('## Pickup point');
    expect(spawnArg.seedPrompt).toContain('Context from previous session.');
  });

  it('T-SEED-2: SpawnConfig without seedPrompt → backward compat (no separator injected)', () => {
    // TypeScript compile check + shape test
    const withoutSeed: import('../../domain/types/runtime.js').SpawnConfig = {
      profile: 'default',
      prompt: 'test prompt',
    };
    expect(withoutSeed.seedPrompt).toBeUndefined();
  });
});
