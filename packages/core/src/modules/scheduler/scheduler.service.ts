/**
 * SchedulerService — cron-driven plan enqueue for time-based sessions (Task 3.7).
 *
 * On daemon boot, registers a `node-cron` job for every (projectId, cronName,
 * cronExpression) triple declared under each project profile's `cron:` map.
 * On each tick, calls QueueService.enqueue() with a deterministic dedup key
 * (`cron:<cronName>:<isoMinuteBucket>`) so re-firing within the same minute
 * is a no-op.
 *
 * Hot-reload: subscribes to project.registered / project.updated / project.removed
 * events and recomputes per-project schedules on each change. Full daemon restart
 * is NOT required for profile changes (charter N6).
 *
 * Restart semantics: schedules are recomputed from current profiles.
 * NO missed-tick replay (Karpathy P2 — simplicity wins). If the daemon was down
 * at 09:00, the next fire is the next 09:00. The operator can re-drop a plan
 * file to recover.
 *
 * I-1: No LLM API imports.
 * I-2: No project-specific names hardcoded. The cron `name` is a generic key
 *      from profile.yaml.
 * I-9: Every state change emits a structured log line.
 * I-10: Profile `cron:` field is zod-validated via ProfileSchema before this
 *        service sees it (ProjectRegistryService → profile.ts refine).
 * I-11: Every state change emits both a log line AND an OTEL span event.
 * I-14: No module-level let/var mutable state.
 */

import * as path from 'node:path';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { schedule, validate } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { Profile } from '../../domain/profile.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import { QueueService } from '../queue/queue.service.js';
import { TracingService } from '../tracing/tracing.service.js';

// ── Job descriptor (for listJobs snapshot) ────────────────────────────────────

export interface JobDescriptor {
  projectId: string;
  cronName: string;
  expression: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);

  /** projectId → cronName → { handle, expression } */
  private readonly jobs = new Map<
    string,
    Map<string, { task: ScheduledTask; expression: string }>
  >();

  /** Unsubscribe handles for project.* events. */
  private readonly unsubs: Array<() => void> = [];

  /**
   * Tracks in-flight tick promises.
   *
   * node-cron's task.stop() prevents new ticks but does NOT await any tick
   * already running. We track each launched tick so onModuleDestroy() can
   * await them all before returning — ensuring no prisma call races against
   * PrismaService.onModuleDestroy() which closes the DB connection.
   *
   * MINOR-3 fix: Phase 4, Task 4.3.
   */
  private readonly inFlightTicks = new Set<Promise<void>>();

  constructor(
    private readonly registry: ProjectRegistryService,
    private readonly queue: QueueService,
    private readonly eventBus: EventBusService,
    private readonly tracing: TracingService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const projects = await this.registry.listProjects();
    let totalJobs = 0;
    let skippedInvalid = 0;

    for (const profile of projects) {
      const { registered, skipped } = this.registerProject(profile);
      totalJobs += registered;
      skippedInvalid += skipped;
    }

    // Subscribe to hot-reload events
    this.unsubs.push(
      this.eventBus.on(EVENT_CHANNELS.project.registered, ({ project }) => {
        this.registerProject(project);
      }),
      this.eventBus.on(EVENT_CHANNELS.project.updated, ({ project }) => {
        this.registerProject(project);
      }),
      this.eventBus.on(EVENT_CHANNELS.project.removed, ({ projectId }) => {
        this.unregisterProject(projectId);
      }),
    );

    this.logger.log({
      msg: 'scheduler:boot',
      module: 'SchedulerService',
      totalProjects: projects.length,
      totalJobs,
      skippedInvalid,
    });
  }

  async onModuleDestroy(): Promise<void> {
    let stoppedJobs = 0;

    // Step 1: stop all cron tasks — prevents any NEW ticks from firing.
    // node-cron v4 stop() is synchronous for InlineScheduledTask (clears the
    // heartbeat timeout); await is a no-op but kept for API compatibility.
    for (const [, cronMap] of this.jobs) {
      for (const [, { task }] of cronMap) {
        await task.stop();
        stoppedJobs++;
      }
    }
    this.jobs.clear();

    // Step 2: await all in-flight tick promises.
    //
    // A tick may have started BEFORE stop() was called. We must drain these
    // before returning so that no prisma.$transaction() call races against
    // PrismaService.onModuleDestroy() which closes the DB connection.
    // Errors are swallowed here — they were already logged in onTick().
    if (this.inFlightTicks.size > 0) {
      await Promise.all(
        Array.from(this.inFlightTicks).map((p) => p.catch(() => undefined)),
      );
    }

    // Step 3: unsubscribe from project.* events.
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;

    this.logger.log({
      msg: 'scheduler:shutdown',
      module: 'SchedulerService',
      stoppedJobs,
    });
  }

  // ── Public API (for tests) ────────────────────────────────────────────────

  /** Returns count of registered jobs across all projects. */
  jobCount(): number {
    let count = 0;
    for (const cronMap of this.jobs.values()) {
      count += cronMap.size;
    }
    return count;
  }

  /** Returns an immutable snapshot of all registered jobs for assertions. */
  listJobs(): ReadonlyArray<JobDescriptor> {
    const result: JobDescriptor[] = [];
    for (const [projectId, cronMap] of this.jobs) {
      for (const [cronName, { expression }] of cronMap) {
        result.push({ projectId, cronName, expression });
      }
    }
    return result;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Register all cron jobs for a profile.
   *
   * If a slot for profile.projectId already exists, unregister first
   * (covers the project.updated case). Returns counts for boot logging.
   */
  private registerProject(profile: Profile): {
    registered: number;
    skipped: number;
  } {
    const { projectId, cron } = profile;

    // Tear down any existing jobs for this project (hot-reload).
    if (this.jobs.has(projectId)) {
      this.unregisterProject(projectId);
    }

    const cronMap = new Map<
      string,
      { task: ScheduledTask; expression: string }
    >();
    let registered = 0;
    let skipped = 0;

    for (const [cronName, expression] of Object.entries(cron)) {
      // Defense-in-depth: schema should have caught this, but validate again.
      if (!validate(expression)) {
        this.logger.warn({
          msg: 'scheduler:cron-invalid',
          module: 'SchedulerService',
          projectId,
          cronName,
          expression,
          reason: 'expression rejected by node-cron validate() at runtime',
        });
        this.eventBus.emit(EVENT_CHANNELS.scheduler.cronInvalid, {
          projectId,
          cronName,
          expression,
          reason: 'expression rejected by node-cron validate() at runtime',
        });
        skipped++;
        continue;
      }

      try {
        const task = schedule(expression, () => {
          // Track the in-flight promise so onModuleDestroy() can await it.
          // ref.p is assigned synchronously before the finally callback can
          // fire (Promise.finally runs asynchronously), so the self-reference
          // is safe.
          const ref = { p: null as Promise<void> | null };
          ref.p = this.onTick(projectId, cronName, expression).finally(() => {
            if (ref.p !== null) this.inFlightTicks.delete(ref.p);
          });
          this.inFlightTicks.add(ref.p);
        });

        cronMap.set(cronName, { task, expression });
        registered++;

        this.logger.log({
          msg: 'scheduler:register',
          module: 'SchedulerService',
          projectId,
          cronName,
          expression,
        });
      } catch (err) {
        // schedule() threw — treat as invalid
        this.logger.warn({
          msg: 'scheduler:cron-invalid',
          module: 'SchedulerService',
          projectId,
          cronName,
          expression,
          reason: String(err),
        });
        this.eventBus.emit(EVENT_CHANNELS.scheduler.cronInvalid, {
          projectId,
          cronName,
          expression,
          reason: String(err),
        });
        skipped++;
      }
    }

    if (cronMap.size > 0) {
      this.jobs.set(projectId, cronMap);
    }

    return { registered, skipped };
  }

  /**
   * Stop and remove all cron jobs for a project.
   *
   * Called on project.removed and before re-registration on project.updated.
   */
  private unregisterProject(projectId: string): void {
    const cronMap = this.jobs.get(projectId);
    if (cronMap === undefined) return;

    for (const [cronName, { task }] of cronMap) {
      void task.stop();
      this.logger.log({
        msg: 'scheduler:unregister',
        module: 'SchedulerService',
        projectId,
        cronName,
      });
    }
    this.jobs.delete(projectId);
  }

  /**
   * Tick handler — fires on each cron schedule.
   *
   * Builds the plan path from the cron name, constructs a minute-bucket dedup
   * key, and calls QueueService.enqueue(). Failure is logged + span-attributed
   * but NOT retried — QueueService owns retry semantics.
   *
   * I-11: wraps in tracing.withSpan for OTEL span emission.
   * I-2: planPath is derived from operator-supplied profile data; no hardcoded names.
   */
  private async onTick(
    projectId: string,
    cronName: string,
    expression: string,
  ): Promise<void> {
    const project = await this.registry.getProject(projectId);
    if (project === undefined) {
      // Raced with project.removed — safe to ignore.
      return;
    }

    const planPath = path.join(
      project.rootPath,
      'session-plans',
      'pending',
      `${cronName}.md`,
    );

    // Minute-bucket dedup key: same cron firing twice in the same wall minute
    // is collapsed by QueueService's existing (projectId, dedupKey) unique constraint.
    const isoMinute = new Date().toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
    const dedupKey = `cron:${cronName}:${isoMinute}`;

    await this.tracing.withSpan('scheduler.tick', async (span) => {
      span.setAttribute('scheduler.projectId', projectId);
      span.setAttribute('scheduler.cronName', cronName);
      span.setAttribute('scheduler.expression', expression);

      try {
        const item = await this.queue.enqueue({
          projectId,
          planPath,
          dedupKey,
          mtime: Date.now(),
          sessionType: 'cron', // generic — not project-specific (I-2)
        });

        span.setAttribute('queue.itemId', item.id);

        // Compute nextRunAt from node-cron v4's getNextRun() API.
        const taskEntry = this.jobs.get(projectId)?.get(cronName);
        const nextRun = taskEntry?.task.getNextRun();
        const nextRunAt =
          nextRun instanceof Date ? nextRun.toISOString() : undefined;

        this.eventBus.emit(EVENT_CHANNELS.scheduler.tickFired, {
          projectId,
          cronName,
          expression,
          firedAt: new Date().toISOString(),
          ...(nextRunAt !== undefined ? { nextRunAt } : {}),
          itemId: item.id,
        });

        this.logger.log({
          msg: 'scheduler:tick-fired',
          module: 'SchedulerService',
          projectId,
          cronName,
          dedupKey,
          itemId: item.id,
        });
      } catch (err) {
        span.setAttribute('error', true);
        this.logger.error({
          msg: 'scheduler.tick:enqueue-failed',
          module: 'SchedulerService',
          projectId,
          cronName,
          error: String(err),
        });
        // Do NOT retry — QueueService owns retry. Do NOT throw — would be swallowed anyway.
      }
    });
  }
}
