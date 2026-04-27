/**
 * TracingModule — NestJS global module for OpenTelemetry instrumentation.
 *
 * Task 2.9 change (R4 fix): the NodeSDK is now created and started in
 * `tracing-bootstrap.ts` (loaded at the very top of main.ts, before NestFactory).
 * This module no longer creates a second SDK. Instead, it:
 *  1. On init: confirms the SDK was already started by bootstrapTracing(); logs
 *     a startup line so boot-log greps still work.
 *  2. On destroy: calls shutdownTracing() to flush in-flight spans.
 *
 * Env vars honoured (same as before — bootstrap reads them):
 *  OTEL_EXPORTER_OTLP_ENDPOINT — default http://127.0.0.1:4318
 *  OTEL_SERVICE_NAME            — overrides default "orch"
 *
 * I-12: SDK init failure is caught and wrapped in TracingInitError.
 *       OTEL export errors must NOT crash the daemon — warn-and-continue.
 */

import {
  Global,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { TracingService } from './tracing.service.js';
import { TracingInitError } from './tracing.errors.js';
import { getStartedSdk, shutdownTracing } from '../../tracing-bootstrap.js';
import { ContextBudgetModule } from '../context-budget/context-budget.module.js';
import { ContextBudgetSpanProcessor } from '../context-budget/context-budget.span-processor.js';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';

// ── Module ────────────────────────────────────────────────────────────────────

@Global()
@Module({
  imports: [ContextBudgetModule],
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TracingModule.name);

  constructor(
    @Optional()
    private readonly contextBudgetSpanProcessor: ContextBudgetSpanProcessor | null,
  ) {}

  onModuleInit(): void {
    const sdk = getStartedSdk();

    if (sdk === null) {
      const wrapped = new TracingInitError(
        'OTel SDK was not pre-started by tracing-bootstrap-startup. ' +
          'Ensure tracing-bootstrap-startup.ts is imported at the top of main.ts.',
        {},
      );

      // In test harnesses (Jest / Vitest workers), warn and continue so that
      // specs that import TracingModule without bootstrapTracing() do not crash.
      // In production, a missing SDK is a misconfiguration — throw immediately
      // so the daemon fails loudly rather than running silently without tracing.
      const isTestHarness =
        process.env['NODE_ENV'] === 'test' ||
        Boolean(process.env['JEST_WORKER_ID']) ||
        Boolean(process.env['VITEST_WORKER_ID']);

      if (isTestHarness) {
        this.logger.warn({
          msg: 'tracing:sdk-not-pre-started',
          error: wrapped.message,
        });
        return;
      }

      throw wrapped;
    }

    const endpoint =
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://127.0.0.1:4318';
    const serviceName = process.env['OTEL_SERVICE_NAME'] ?? 'orch';

    this.logger.log({
      msg: 'tracing:sdk-started',
      endpoint,
      serviceName,
    });

    // Register ContextBudgetSpanProcessor against the active provider.
    //
    // The NodeSDK wraps the underlying provider in a ProxyTracerProvider.
    // We must unwrap via getDelegate() to reach the BasicTracerProvider that
    // exposes addSpanProcessor(). This is the documented OTEL escape hatch —
    // see decisions/004-context-full-ingestion-mode.md for rationale.
    //
    // Registration is best-effort: if the cast fails (e.g., future OTEL SDK
    // version changes the internal shape), we log a warning and continue.
    // The daemon MUST NOT crash because of a processor registration failure.
    //
    // In test harnesses (Jest/Vitest), we skip registration to avoid
    // contaminating the OTEL global provider state across test suites.
    // The integration test (context-budget.integration.spec.ts) creates its
    // own NodeTracerProvider and registers the processor directly.
    const isTestHarness =
      process.env['NODE_ENV'] === 'test' ||
      Boolean(process.env['JEST_WORKER_ID']) ||
      Boolean(process.env['VITEST_WORKER_ID']);

    if (this.contextBudgetSpanProcessor !== null && !isTestHarness) {
      try {
        const rawProvider = trace.getTracerProvider() as unknown as {
          getDelegate?: () => BasicTracerProvider;
          addSpanProcessor?: (p: ContextBudgetSpanProcessor) => void;
        };
        const realProvider =
          typeof rawProvider.getDelegate === 'function'
            ? rawProvider.getDelegate()
            : (rawProvider as unknown as BasicTracerProvider);

        if (
          typeof (realProvider as unknown as { addSpanProcessor?: unknown })
            .addSpanProcessor === 'function'
        ) {
          realProvider.addSpanProcessor(this.contextBudgetSpanProcessor);
          this.logger.log({
            msg: 'tracing:context-budget-processor-registered',
          });
        } else {
          this.logger.warn({
            msg: 'tracing:context-budget-processor-not-registered',
            reason:
              'provider lacks addSpanProcessor — budget detector disabled',
          });
        }
      } catch (err) {
        // Non-fatal: budget detector disabled; daemon continues without it.
        this.logger.warn({
          msg: 'tracing:context-budget-processor-registration-failed',
          error: String(err),
        });
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Flush the context budget processor before shutting down the SDK.
    if (this.contextBudgetSpanProcessor !== null) {
      try {
        await this.contextBudgetSpanProcessor.forceFlush();
      } catch {
        // Non-fatal
      }
    }

    try {
      await shutdownTracing();
      this.logger.log({ msg: 'tracing:sdk-shutdown' });
    } catch (err) {
      // Shutdown failure is non-fatal — just log
      this.logger.warn({
        msg: 'tracing:sdk-shutdown-failed',
        error: String(err),
      });
    }
  }
}
