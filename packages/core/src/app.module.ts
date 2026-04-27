/**
 * AppModule — root NestJS module for the Orch daemon.
 *
 * Import order:
 *  1. ConfigModule (global) — must be first so all other modules can inject ConfigService.
 *  2. Infrastructure modules (TracingModule, EventsModule, DbModule, SecurityModule).
 *  3. Feature modules (ProjectRegistryModule, QueueModule, SessionsModule, HooksModule, ApiModule).
 *  4. Utility modules (NotifierModule, HealthModule).
 *
 * onModuleInit populates the globalThis OrchContext (D4) so domain code can call
 * getOrchContext() after bootstrap completes. The four slots are:
 *   store    → OrchStoreService (DbModule)
 *   runtime  → ClaudeCodeAdapter (SessionsModule)
 *   notifier → ConsoleNotifierService (NotifierModule — Phase 1 log-only)
 *   tracer   → TracingService (TracingModule)
 *
 * Per SYNTHESIS §6.5 mitigation: domain APIs also accept context as an arg, so
 * boot ordering is safe — nothing calls getOrchContext() before onModuleInit fires.
 *
 * I-14: No domain/ imports here beyond the init function and context types.
 */

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './modules/db/prisma.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { TracingModule } from './modules/tracing/tracing.module.js';
import { SecurityModule } from './modules/security/security.module.js';
import { ProjectRegistryModule } from './modules/project-registry/project-registry.module.js';
import { ContextBudgetModule } from './modules/context-budget/context-budget.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { HooksModule } from './modules/hooks/hooks.module.js';
import { ApiModule } from './modules/api/api.module.js';
import { SseModule } from './modules/events/sse.module.js';
import { NotifierModule } from './modules/notifier/notifier.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HandoffModule } from './modules/handoff/handoff.module.js';
import { SchedulerModule } from './modules/scheduler/scheduler.module.js';
import { OrchStoreService } from './modules/db/orch-store.service.js';
import { ClaudeCodeAdapter } from './modules/sessions/claude-code-adapter.js';
import { ConsoleNotifierService } from './modules/notifier/console-notifier.service.js';
import { TracingService } from './modules/tracing/tracing.service.js';
import { TRACER_TOKEN } from './modules/handoff/types.js';
import { initOrchContext } from './domain/context.js';

@Module({
  imports: [
    // Config must be first so other modules can inject ConfigService.
    // Env validation happens in main.ts bootstrap (validateEnv called explicitly)
    // so that test harnesses can import AppModule without requiring production env vars.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: process.env['NODE_ENV'] === 'test',
    }),
    // Infrastructure
    TracingModule,
    EventsModule,
    DbModule,
    SecurityModule,
    // Feature modules
    ProjectRegistryModule,
    ContextBudgetModule,
    QueueModule,
    SessionsModule,
    HooksModule,
    ApiModule,
    SseModule,
    // Handoff — session context handoff + successor spawn (Task 3.6)
    HandoffModule,
    // Scheduler — cron-driven enqueue for time-based plans (Task 3.7)
    SchedulerModule,
    // Utility modules
    NotifierModule,
    HealthModule,
  ],
  providers: [
    // TRACER_TOKEN binding: provides TracingService under the handoff module's
    // TRACER_TOKEN symbol so HandoffContextBuilder can emit OTEL spans in production.
    // HandoffContextBuilder uses @Optional() so this is a non-breaking addition.
    {
      provide: TRACER_TOKEN,
      useExisting: TracingService,
    },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(
    private readonly store: OrchStoreService,
    private readonly runtime: ClaudeCodeAdapter,
    private readonly notifier: ConsoleNotifierService,
    private readonly tracer: TracingService,
  ) {}

  onModuleInit(): void {
    initOrchContext({
      store: this.store,
      runtime: this.runtime,
      notifier: this.notifier,
      tracer: this.tracer,
    });

    this.logger.log({ msg: 'orch:context-initialized' });
  }
}
