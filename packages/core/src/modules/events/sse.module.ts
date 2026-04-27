/**
 * SseModule — NestJS module providing the SSE event streaming endpoint.
 *
 * Provides:
 *  - SseController: GET /api/v1/events/stream with BearerAuthGuard
 *  - BearerAuthGuard: DI-registered for @UseGuards injection in controller
 *
 * Dependencies:
 *  - EventsModule: @Global() — EventBusService injected automatically
 *  - TracingModule: @Global() — TracingService injected automatically
 *
 * Auth: BearerAuthGuard applied via @UseGuards() on SseController.
 * Middleware forRoutes() covers api/v1/* in ApiModule — the /api/v1/events/stream
 * path is also covered by that pattern, providing dual-layer auth.
 *
 * Cross-module communication: reads EventBusService via DI only.
 * I-4: @orch/telegram + @orch/web consume via HTTP; no direct imports from this module.
 */

import { Module } from '@nestjs/common';
import { SseController } from './sse-controller.js';
import { BearerAuthGuard } from '../api/bearer-auth.guard.js';

@Module({
  controllers: [SseController],
  providers: [BearerAuthGuard],
})
export class SseModule {}
