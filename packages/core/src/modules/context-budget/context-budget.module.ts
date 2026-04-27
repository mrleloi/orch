/**
 * ContextBudgetModule — NestJS module for per-session context token accounting.
 *
 * Provides:
 *  - ContextBudgetService: per-session token accumulator + threshold event emitter.
 *  - ContextBudgetSpanProcessor: OTEL SpanProcessor that feeds spans to the service.
 *
 * This module does NOT register the SpanProcessor on the OTEL provider.
 * That registration happens in TracingModule.onModuleInit, which imports this module
 * and injects ContextBudgetSpanProcessor. This avoids a circular dependency:
 *   ContextBudgetModule → (EventsModule, ProjectRegistryModule) but NOT TracingModule.
 *
 * I-1: Zero LLM API imports in this module or any of its providers.
 * I-2: No project-specific names.
 */

import { Module } from '@nestjs/common';
import { ContextBudgetService } from './context-budget.service.js';
import { ContextBudgetSpanProcessor } from './context-budget.span-processor.js';
import { ProjectRegistryModule } from '../project-registry/project-registry.module.js';

@Module({
  imports: [ProjectRegistryModule],
  providers: [ContextBudgetService, ContextBudgetSpanProcessor],
  exports: [ContextBudgetService, ContextBudgetSpanProcessor],
})
export class ContextBudgetModule {}
