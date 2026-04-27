/**
 * ApiModule — NestJS module providing REST API endpoints at /api/v1/*.
 *
 * Provides:
 *  - ApiController: GET/POST endpoints for projects, queue, sessions
 *  - BearerAuthMiddleware: applied to all /api/v1/* routes
 *
 * Dependencies:
 *  - ProjectRegistryModule: ProjectRegistryService.listProjects()
 *  - QueueModule:           QueueService.enqueue() + QueueRepository.list()
 *  - SessionsModule:        SessionManager.getActiveSessions() + terminate()
 *
 * EventsModule and TracingModule are @Global so they are available without
 * explicit import here.
 *
 * Cross-module communication: reads from sibling modules via DI only.
 * No direct cross-feature imports (architecture invariant).
 *
 * I-6:  POST /sessions/:id/stop requires ?confirm=1 (enforced in controller).
 * I-10: All external bodies validated via zod (enforced in controller).
 * I-14: Domain types only in domain/; no NestJS imports in domain/.
 */

import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ApiController } from './api.controller.js';
import { BearerAuthMiddleware } from './bearer-auth.middleware.js';
import { ProjectRegistryModule } from '../project-registry/project-registry.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { ContextBudgetModule } from '../context-budget/context-budget.module.js';

@Module({
  imports: [
    ProjectRegistryModule,
    QueueModule,
    SessionsModule,
    AuditModule,
    ContextBudgetModule,
  ],
  controllers: [ApiController],
  providers: [BearerAuthMiddleware],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(BearerAuthMiddleware)
      .forRoutes({ path: 'api/v1/*path', method: RequestMethod.ALL });
  }
}
