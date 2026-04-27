/**
 * ProjectRegistryModule — NestJS module providing project discovery, validation,
 * and persistence for managed projects registered with Orch.
 *
 * Imports:
 *  - DbModule: provides OrchStoreService for Project row persistence
 *
 * EventBusService is globally provided by EventsModule (Task 1.7) — no local import needed.
 *
 * Cross-module communication: exports ProjectRegistryService so other feature
 * modules can call listProjects() / getProject() via DI (no direct imports).
 *
 * Auth: BearerAuthMiddleware applied to admin/* routes (mirrors ApiModule's
 * coverage of api/v1/*). This ensures POST /admin/reload requires a valid
 * Authorization: Bearer token — same token as the REST API (ORCH_API_BEARER_TOKEN).
 */

import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { DbModule } from '../db/prisma.module.js';
import { BearerAuthMiddleware } from '../api/bearer-auth.middleware.js';
import { ProjectRegistryService } from './project-registry.service.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [DbModule],
  controllers: [AdminController],
  providers: [ProjectRegistryService, BearerAuthMiddleware],
  exports: [ProjectRegistryService],
})
export class ProjectRegistryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(BearerAuthMiddleware)
      .forRoutes({ path: 'admin/*path', method: RequestMethod.ALL });
  }
}
