/**
 * QueueModule — NestJS module for the Orch plan queue.
 *
 * Providers:
 *  - QueueRepository   — thin Prisma wrapper (exported for Task 1.11 REST API)
 *  - QueueService      — public API for enqueue/next/complete/fail/pause/resume
 *  - QueueWatcherService — file-system watcher that auto-enqueues plan files
 *
 * Imports:
 *  - DbModule              — provides PrismaService
 *  - ProjectRegistryModule — provides ProjectRegistryService (watcher hooks its events)
 *
 * EventBusService and TracingService are globally provided (@Global) by
 * EventsModule and TracingModule respectively — no local import needed.
 *
 * Cross-module note (architecture invariant):
 *   QueueWatcherService listens to `project.registered` / `project.removed` events
 *   via EventBus. It does NOT directly inject ProjectRegistryService, keeping
 *   module boundaries clean.
 */

import { Module } from '@nestjs/common';
import { DbModule } from '../db/prisma.module.js';
import { QueueRepository } from './queue.repository.js';
import { QueueService } from './queue.service.js';
import { QueueWatcherService } from './queue-watcher.service.js';
import { QueueClaimService } from './queue-claim.service.js';

@Module({
  imports: [DbModule],
  providers: [
    QueueRepository,
    QueueService,
    QueueWatcherService,
    QueueClaimService,
  ],
  exports: [QueueService, QueueRepository, QueueClaimService],
})
export class QueueModule {}
