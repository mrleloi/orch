/**
 * HooksModule — NestJS module for the Claude Code hooks receiver.
 *
 * Provides:
 *  - HooksController: POST /hooks/:event
 *  - HooksService: processEvent() with transaction-wrapped state machine
 *  - HookSecretMiddleware: applied to all /hooks/* routes
 *
 * Dependencies:
 *  - DbModule: PrismaService (direct $transaction) + OrchStoreService
 *  - EventsModule: @Global() — EventBusService injected automatically
 *  - TracingModule: @Global() — TracingService injected automatically
 *
 * Cross-module communication: emits on EventBusService, never imports SessionsModule
 * (no direct cross-feature dependency per architecture invariant).
 */

import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { HooksController } from './hooks.controller.js';
import { HooksService } from './hooks.service.js';
import { HookSecretMiddleware } from './hook-secret.middleware.js';
import { DbModule } from '../db/prisma.module.js';

@Module({
  imports: [DbModule],
  controllers: [HooksController],
  providers: [HooksService],
  exports: [HooksService],
})
export class HooksModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HookSecretMiddleware)
      .forRoutes({ path: 'hooks/*path', method: RequestMethod.POST });
  }
}
