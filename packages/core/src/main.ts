/**
 * Orch daemon bootstrap.
 *
 * Platform: Fastify (I-7 — lightweight, fast for hook receiver).
 * Logger:   Fastify built-in Pino (logger: true) — no separate nestjs-pino dep needed.
 * Bind:     127.0.0.1 by default (I-7 — localhost-only; override via ORCH_HTTP_HOST).
 * Port:     4141 by default (override via ORCH_HTTP_PORT).
 *
 * Graceful shutdown:
 *   SIGINT / SIGTERM → app.close() → NestJS lifecycle hooks fire → process exits 0.
 *   app.enableShutdownHooks() activates the NestJS OnModuleDestroy lifecycle.
 *
 * Env vars (validated by AppModule via zod; see config/env.schema.ts):
 *   ORCH_HTTP_PORT   — default 4141
 *   ORCH_HTTP_HOST   — default 127.0.0.1
 *   ORCH_HOOK_SECRET         — required, non-empty
 *   ORCH_API_BEARER_TOKEN    — required, non-empty
 *
 * Task 2.9: OTEL bootstrap MUST be loaded before any NestJS / Fastify import so
 * that HTTP + Fastify + Pino auto-instrumentations register before the adapters
 * initialize (R2 mitigation). The side-effect import below satisfies this ordering.
 */

// ── OTEL bootstrap: MUST be first (before any @nestjs/* import) ───────────────
import './tracing-bootstrap-startup.js';

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { runStartupChecks } from './config/startup-checks.js';
import { PrismaService } from './modules/db/prisma.service.js';
import { validateEnv } from './config/env.schema.js';
import { createPinoOtelMixin } from './modules/tracing/pino-otel.js';
import { redactLogObject } from './modules/security/redact-log-object.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<NestFastifyApplication> {
  // Validate env before creating the app — fast fail with clear error message.
  // Done in main.ts (not ConfigModule.validate) so test harnesses can import
  // AppModule without requiring production env vars.
  const env = validateEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: env.ORCH_LOG_LEVEL,
        mixin: createPinoOtelMixin(),
        formatters: {
          log: (obj: Record<string, unknown>) => redactLogObject(obj),
        },
      },
    }),
  );

  // Enable NestJS lifecycle shutdown hooks (OnModuleDestroy, etc.)
  app.enableShutdownHooks();

  const port = env.ORCH_HTTP_PORT;
  const host = env.ORCH_HTTP_HOST;

  // Startup checks — DB schema (fatal), ORCH_HOME + OTEL (warn-only)
  const prisma = app.get(PrismaService);
  await runStartupChecks(prisma, {
    orchHome: env.ORCH_HOME,
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  await app.listen(port, host);

  // Single line that `pnpm run dev` watchers can grep for
  logger.log(`orch ready on port ${port}`);

  return app;
}

// Graceful shutdown handlers — defined outside bootstrap() to handle cases
// where the signal arrives before or after listen() resolves.
function shutdown(): void {
  logger.log('orch:shutdown-signal received — closing gracefully');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrap()
  .then((app) => {
    // Unhandled promise rejection — shut down gracefully so k8s/systemd can restart.
    // Placed AFTER app.listen() so `app` is in scope.
    process.on('unhandledRejection', (reason) => {
      logger.error(
        {
          err:
            reason instanceof Error
              ? (reason.stack ?? String(reason))
              : String(reason),
        },
        'unhandled promise rejection — shutting down',
      );
      app
        .close()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });

    // Uncaught synchronous exception — same treatment.
    process.on('uncaughtException', (err) => {
      logger.error(
        { err: err.stack ?? String(err) },
        'uncaught exception — shutting down',
      );
      app
        .close()
        .then(() => process.exit(1))
        .catch(() => process.exit(1));
    });
  })
  .catch((err: unknown) => {
    console.error('Failed to start Orch daemon:', err);
    process.exit(1);
  });
