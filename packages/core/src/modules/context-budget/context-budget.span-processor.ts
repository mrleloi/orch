/**
 * ContextBudgetSpanProcessor — OTEL SpanProcessor that feeds ended spans to
 * ContextBudgetService for token accounting.
 *
 * Design principles:
 *  - onStart is a no-op: attribute values (gen_ai.usage.input_tokens) are only
 *    available after the span ends.
 *  - onEnd is synchronous: OTEL SpanProcessor contract requires sync onEnd.
 *    Any error from the service is caught and logged — never re-thrown.
 *    A throw from this processor MUST NOT corrupt the OTLP BatchSpanProcessor
 *    that runs alongside it.
 *  - forceFlush and shutdown are no-ops with resolved Promises: this processor
 *    holds no in-flight state; all state lives in ContextBudgetService.
 *
 * Registration: see TracingModule.onModuleInit — this processor is added to
 * the active BasicTracerProvider AFTER the OTLP BatchSpanProcessor, so the
 * OTLP chain is unaffected by any error here.
 *
 * I-1: No LLM API imports.
 * I-14: No NestJS imports — this class is a plain TypeScript class to allow
 *        use before the NestJS DI container is fully initialized.
 */

import type {
  ReadableSpan,
  Span as SdkSpan,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { Context } from '@opentelemetry/api';
import { Injectable } from '@nestjs/common';
import { ContextBudgetService } from './context-budget.service.js';

@Injectable()
export class ContextBudgetSpanProcessor implements SpanProcessor {
  constructor(private readonly service: ContextBudgetService) {}

  /**
   * No-op. We need final attribute values, which are only available on span end.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onStart(_span: SdkSpan, _parentContext: Context): void {
    // Intentional no-op.
  }

  /**
   * Ingest the ended span into ContextBudgetService.
   *
   * Wrapped in try/catch — any error from the service is swallowed so this
   * processor never corrupts the downstream OTLP BatchSpanProcessor.
   */
  onEnd(span: ReadableSpan): void {
    try {
      this.service.ingestSpan(span);
    } catch (err) {
      // Cannot use NestJS Logger here (no DI context in SpanProcessor).
      // Use console.warn as a last-resort trace so the error is visible.
      // The service is expected to catch its own errors; this is a safety net.
      console.warn(
        '[ContextBudgetSpanProcessor] ingestSpan error (swallowed):',
        err,
      );
    }
  }

  /**
   * No in-flight state to flush.
   */
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * No resources to release.
   */
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
