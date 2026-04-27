/**
 * SchedulerService spec — T-SCHED-2 through T-SCHED-8
 *
 * Uses jest fake timers to control cron tick timing without real wall-clock waits.
 * All external deps (QueueService, ProjectRegistryService, EventBusService,
 * TracingService) are mocked — no real DB, no real filesystem, no subprocesses (I-13).
 *
 * Test contracts per plan §Part B:
 *  T-SCHED-2: valid cron registers and fires once per scheduled tick
 *  T-SCHED-3: multiple projects isolated
 *  T-SCHED-4: scheduler.cron-invalid emitted on bad spec slipping past schema
 *  T-SCHED-5: restart performs no replay
 *  T-SCHED-6: daemon shutdown stops all jobs
 *  T-SCHED-7: project.registered after boot registers cron job
 *  T-SCHED-8: project.removed unregisters jobs
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SchedulerService } from './scheduler.service.js';
import { QueueService } from '../queue/queue.service.js';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import { EventBusService } from '../events/event-bus.service.js';
import { TracingService } from '../tracing/tracing.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import type { Profile } from '../../domain/profile.js';
import type { ISpan } from '../../domain/types/tracer.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

type EventHandler = (payload: unknown) => void | Promise<void>;

class MockEventBusService {
  private readonly handlers = new Map<string, EventHandler[]>();

  emit = jest.fn((channel: string, payload: unknown): void => {
    const hs = this.handlers.get(channel) ?? [];
    for (const h of hs) {
      void h(payload);
    }
  });

  on = jest.fn((channel: string, handler: EventHandler): (() => void) => {
    const existing = this.handlers.get(channel) ?? [];
    this.handlers.set(channel, [...existing, handler]);
    return () => {
      const hs = this.handlers.get(channel) ?? [];
      this.handlers.set(
        channel,
        hs.filter((h) => h !== handler),
      );
    };
  });

  once = jest.fn().mockResolvedValue({});

  /** Test helper: trigger an event directly on the bus (bypassing emit logging). */
  trigger(channel: string, payload: unknown): void {
    const hs = this.handlers.get(channel) ?? [];
    for (const h of hs) {
      void h(payload);
    }
  }
}

class MockQueueService {
  enqueue = jest.fn().mockResolvedValue({ id: 'mock-queue-item-id' });
}

class MockProjectRegistryService {
  private profiles: Profile[] = [];

  setProfiles(profiles: Profile[]): void {
    this.profiles = profiles;
  }

  listProjects = jest.fn((): Promise<Profile[]> => Promise.resolve(this.profiles));

  getProject = jest.fn(
    (projectId: string): Promise<Profile | undefined> =>
      Promise.resolve(this.profiles.find((p) => p.projectId === projectId)),
  );
}

class MockTracingService {
  withSpan = jest.fn(
    async (
      _name: string,
      fn: (span: ISpan) => Promise<void>,
    ): Promise<void> => {
      const span: ISpan = {
        setAttribute: jest.fn(),
        addEvent: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      };
      await fn(span);
    },
  );
}

// ── Profile builder ───────────────────────────────────────────────────────────

function makeProfile(
  projectId: string,
  rootPath: string,
  cron: Record<string, string>,
): Profile {
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
    cron,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SchedulerService', () => {
  let module: TestingModule;
  let service: SchedulerService;
  let mockQueue: MockQueueService;
  let mockRegistry: MockProjectRegistryService;
  let mockEventBus: MockEventBusService;
  let mockTracing: MockTracingService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    mockQueue = new MockQueueService();
    mockRegistry = new MockProjectRegistryService();
    mockEventBus = new MockEventBusService();
    mockTracing = new MockTracingService();
  });

  async function buildModule(): Promise<void> {
    module = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: QueueService, useValue: mockQueue },
        { provide: ProjectRegistryService, useValue: mockRegistry },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: TracingService, useValue: mockTracing },
      ],
    }).compile();

    service = module.get(SchedulerService);
  }

  afterEach(async () => {
    jest.useRealTimers();
    // Destroy if init was called so node-cron tasks are stopped
    if (module) {
      try {
        await service.onModuleDestroy();
      } catch {
        // ignore
      }
    }
    jest.restoreAllMocks();
  });

  // ── T-SCHED-2: valid cron fires once per tick ────────────────────────────────

  it('T-SCHED-2: registers a valid cron job and fires enqueue at the scheduled time', async () => {
    // Use `* * * * *` (every minute) to avoid local-timezone clock skew with specific
    // hour-based expressions like `0 9 * * *`. The test contract is preserved: a valid
    // cron fires, enqueue is called, planPath and dedupKey are correct.
    // Fake clock at :55 past the minute → next tick in 5s.
    jest.useFakeTimers({ now: new Date('2026-04-25T09:00:55Z') });

    const profile = makeProfile(
      'proj-alpha',
      '/projects/alpha',
      { foo: '* * * * *' },
    );
    mockRegistry.setProfiles([profile]);

    await buildModule();
    await service.onModuleInit();

    // Advance 15 seconds — crosses the :01 minute boundary where `* * * * *` fires
    await jest.advanceTimersByTimeAsync(15_000);

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    const call = mockQueue.enqueue.mock.calls[0][0] as {
      projectId: string;
      planPath: string;
      dedupKey: string;
    };
    expect(call.projectId).toBe('proj-alpha');
    expect(call.planPath).toMatch(/session-plans[/\\]pending[/\\]foo\.md$/);
    // dedupKey format: cron:<cronName>:<YYYY-MM-DDTHH:MM>
    expect(call.dedupKey).toMatch(/^cron:foo:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  // ── T-SCHED-3: multiple projects isolated ────────────────────────────────────

  it('T-SCHED-3: multiple projects register and fire independently', async () => {
    // Start at :55s past the minute — next `* * * * *` tick is 5s away
    jest.useFakeTimers({ now: new Date('2026-04-25T09:00:55Z') });

    const profileAlpha = makeProfile('alpha', '/projects/alpha', { x: '* * * * *' });
    const profileBeta = makeProfile('beta', '/projects/beta', { y: '* * * * *' });
    mockRegistry.setProfiles([profileAlpha, profileBeta]);

    await buildModule();
    await service.onModuleInit();

    // Advance 15s — crosses the next minute boundary once per project
    await jest.advanceTimersByTimeAsync(15_000);

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(2);

    const calls = mockQueue.enqueue.mock.calls as Array<[{ projectId: string; cronName: string; dedupKey: string; planPath: string }]>;
    const projectIds = calls.map((c) => c[0].projectId);
    expect(projectIds).toContain('alpha');
    expect(projectIds).toContain('beta');

    const alphaCall = calls.find((c) => c[0].projectId === 'alpha')![0];
    const betaCall = calls.find((c) => c[0].projectId === 'beta')![0];

    // Plan paths use correct cron name per project
    expect(alphaCall.planPath).toMatch(/session-plans[/\\]pending[/\\]x\.md$/);
    expect(betaCall.planPath).toMatch(/session-plans[/\\]pending[/\\]y\.md$/);

    // dedup keys differ between projects
    expect(alphaCall.dedupKey).not.toBe(betaCall.dedupKey);
  });

  // ── T-SCHED-4: cron-invalid emitted for bad expression ───────────────────────

  it('T-SCHED-4: emits scheduler.cron-invalid for expression bypassing schema', async () => {
    jest.useFakeTimers();

    // Bypass schema validation by injecting raw object through the mock registry.
    // This simulates an upstream skew where an invalid expression slips past parse-time checks.
    const badProfile = makeProfile('proj-bad', '/projects/bad', {});
    // Force-inject invalid cron via the profile object (not through ProfileSchema)
    (badProfile.cron as Record<string, string>)['bad-name'] = 'not a cron expression';

    // Also include a valid entry to verify it still registers
    (badProfile.cron as Record<string, string>)['valid-job'] = '* * * * *';

    mockRegistry.setProfiles([badProfile]);

    await buildModule();
    await service.onModuleInit();

    const invalidEmitCalls = mockEventBus.emit.mock.calls.filter(
      (c) => c[0] === EVENT_CHANNELS.scheduler.cronInvalid,
    );
    expect(invalidEmitCalls).toHaveLength(1);
    const payload = invalidEmitCalls[0][1] as {
      projectId: string;
      cronName: string;
      reason: string;
    };
    expect(payload.projectId).toBe('proj-bad');
    expect(payload.cronName).toBe('bad-name');
    expect(typeof payload.reason).toBe('string');

    // enqueue must NOT have been called for the bad entry
    expect(mockQueue.enqueue).not.toHaveBeenCalled();

    // The valid job should still be registered
    expect(service.jobCount()).toBe(1);
  });

  // ── T-SCHED-5: restart performs no replay ────────────────────────────────────

  it('T-SCHED-5: restart does not replay past ticks (no missed-tick recovery)', async () => {
    // Start at :30s past the minute boundary. The previous :00 tick was in the past.
    // Advance 25 seconds (stay within the same minute) → no tick should fire.
    // This verifies: scheduler does not retroactively replay missed ticks on startup.
    jest.useFakeTimers({ now: new Date('2026-04-25T09:00:30Z') });

    const profile = makeProfile('proj-replay', '/projects/replay', { foo: '* * * * *' });
    mockRegistry.setProfiles([profile]);

    await buildModule();
    await service.onModuleInit();

    // Advance 25 seconds — still within the same minute, no tick should fire yet
    await jest.advanceTimersByTimeAsync(25_000);

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  // ── T-SCHED-6: shutdown stops all jobs ───────────────────────────────────────

  it('T-SCHED-6: onModuleDestroy stops all jobs; no ticks fire after destroy', async () => {
    // Start at :55s past the minute — next `* * * * *` tick is 5s away
    jest.useFakeTimers({ now: new Date('2026-04-25T09:00:55Z') });

    const p1 = makeProfile('p1', '/projects/p1', { a: '* * * * *', b: '* * * * *' });
    const p2 = makeProfile('p2', '/projects/p2', { c: '* * * * *', d: '* * * * *' });
    mockRegistry.setProfiles([p1, p2]);

    await buildModule();
    await service.onModuleInit();

    // Destroy BEFORE the tick fires
    await service.onModuleDestroy();

    // Advance 5 minutes — no ticks should fire since all tasks were stopped
    await jest.advanceTimersByTimeAsync(5 * 60_000);

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
    expect(service.listJobs()).toHaveLength(0);
  });

  // ── T-SCHED-7: project.registered after boot registers cron ──────────────────

  it('T-SCHED-7: project.registered event after boot registers cron and fires tick', async () => {
    // Start at :55s past the minute — next tick in 5s
    jest.useFakeTimers({ now: new Date('2026-04-25T09:00:55Z') });

    // Boot with empty registry
    mockRegistry.setProfiles([]);
    await buildModule();
    await service.onModuleInit();

    expect(service.jobCount()).toBe(0);

    // Simulate hot registration of a new project
    const newProfile = makeProfile('late-proj', '/projects/late', { hourly: '* * * * *' });
    mockRegistry.setProfiles([newProfile]);

    // Trigger the project.registered event through the mock bus handler
    mockEventBus.trigger(EVENT_CHANNELS.project.registered, { project: newProfile });

    // Advance 15s — crosses the next minute boundary
    await jest.advanceTimersByTimeAsync(15_000);

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    const call = mockQueue.enqueue.mock.calls[0][0] as { projectId: string };
    expect(call.projectId).toBe('late-proj');
  });

  // ── T-SCHED-8: project.removed unregisters jobs ──────────────────────────────

  it('T-SCHED-8: project.removed event stops cron jobs; no further ticks', async () => {
    // Start at :55s past the minute — next tick in 5s
    jest.useFakeTimers({ now: new Date('2026-04-25T09:00:55Z') });

    const profile = makeProfile('removable', '/projects/removable', { job: '* * * * *' });
    mockRegistry.setProfiles([profile]);

    await buildModule();
    await service.onModuleInit();

    expect(service.jobCount()).toBe(1);

    // Trigger project.removed BEFORE the tick fires
    mockEventBus.trigger(EVENT_CHANNELS.project.removed, { projectId: 'removable' });
    mockRegistry.setProfiles([]);

    expect(service.jobCount()).toBe(0);

    // Advance 5 minutes — no ticks should fire since the job was stopped
    await jest.advanceTimersByTimeAsync(5 * 60_000);

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  // ── T-SCHED-SD-A: onModuleDestroy awaits in-flight tick (MINOR-3 fix) ─────────
  //
  // Regression guard for the shutdown-ordering race: a tick that starts BEFORE
  // stop() is called must complete (or resolve) before onModuleDestroy() returns.
  // Without the fix, onModuleDestroy() returned while enqueue() was still pending,
  // causing prisma.$transaction() to race against PrismaService.onModuleDestroy().
  //
  // Test strategy: inject an enqueue mock that captures the resolve handle so we
  // can control when the tick completes. Assert that onModuleDestroy() does NOT
  // resolve before the tick finishes.

  it('T-SCHED-SD-A: onModuleDestroy awaits an in-flight tick before returning', async () => {
    jest.useRealTimers();

    // Arrange: enqueue resolves only when we call releaseEnqueue().
    let releaseEnqueue!: () => void;
    const enqueueLatch = new Promise<{ id: string }>((resolve) => {
      releaseEnqueue = () => resolve({ id: 'latch-item-id' });
    });
    mockQueue.enqueue = jest.fn().mockReturnValue(enqueueLatch);

    const profile = makeProfile('sd-proj-a', '/projects/sd-a', { job: '* * * * *' });
    mockRegistry.setProfiles([profile]);

    await buildModule();
    await service.onModuleInit();

    // Act: manually trigger a tick by accessing the internal inFlightTicks set
    // via a direct onTick call — we access private via cast for test-only coupling.
    const tickPromise = (service as unknown as {
      onTick: (projectId: string, cronName: string, expr: string) => Promise<void>;
    }).onTick('sd-proj-a', 'job', '* * * * *');

    // Register the tick promise in inFlightTicks the same way the cron callback does.
    const inFlightTicks = (service as unknown as {
      inFlightTicks: Set<Promise<void>>;
    }).inFlightTicks;
    const trackedTick = tickPromise.finally(() => { inFlightTicks.delete(trackedTick); });
    inFlightTicks.add(trackedTick);

    // Guard: onModuleDestroy must NOT resolve while tick is still pending.
    let destroyResolved = false;
    const destroyPromise = service.onModuleDestroy().then(() => {
      destroyResolved = true;
    });

    // Yield the event loop once — destroy should still be pending (awaiting tick).
    await Promise.resolve();
    await Promise.resolve();
    expect(destroyResolved).toBe(false);

    // Release the enqueue latch — tick can now complete.
    releaseEnqueue();

    // Now destroy should settle.
    await destroyPromise;
    expect(destroyResolved).toBe(true);

    // inFlightTicks is now empty (tick promise was cleaned up in finally).
    expect(inFlightTicks.size).toBe(0);
  });

  // ── T-SCHED-SD-B: onModuleDestroy with no in-flight tick completes without deadlock ──

  it('T-SCHED-SD-B: onModuleDestroy with no in-flight tick completes promptly', async () => {
    jest.useRealTimers();

    const profile = makeProfile('sd-proj-b', '/projects/sd-b', { job: '* * * * *' });
    mockRegistry.setProfiles([profile]);

    await buildModule();
    await service.onModuleInit();

    // No tick has been launched — inFlightTicks is empty.
    const inFlightTicks = (service as unknown as {
      inFlightTicks: Set<Promise<void>>;
    }).inFlightTicks;
    expect(inFlightTicks.size).toBe(0);

    // Should complete without hanging (no deadlock, no timeout).
    // Use a race with a 1s timer to confirm no deadlock.
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), 1000),
    );
    const result = await Promise.race([
      service.onModuleDestroy().then(() => 'done' as const),
      timeout,
    ]);

    expect(result).toBe('done');
  });
});
