/**
 * SchedulerModule — NestJS module for cron-driven plan enqueue (Task 3.7).
 *
 * Provides SchedulerService which, on daemon boot, registers a node-cron job
 * for every (projectId, cronName, cronExpression) triple in each project profile's
 * `cron:` map. On each tick, QueueService.enqueue() is called.
 *
 * Imports:
 *  - QueueModule          — provides QueueService for enqueue calls
 *  - ProjectRegistryModule — provides ProjectRegistryService for profile lookup
 *
 * EventsModule and TracingModule are @Global() — no local import needed.
 *
 * I-1: No LLM SDK imports.
 * I-2: No project-specific names.
 */

import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { ProjectRegistryModule } from '../project-registry/project-registry.module.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [QueueModule, ProjectRegistryModule],
  // EventsModule + TracingModule are @Global — no local import.
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
