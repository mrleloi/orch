/**
 * tracing-bootstrap-startup.ts — Side-effect module loaded at the very top of main.ts.
 *
 * Import this file BEFORE any NestJS / Fastify import in main.ts:
 *
 *   import './tracing-bootstrap-startup.js';
 *   import { NestFactory } from '@nestjs/core';
 *   ...
 *
 * This ensures auto-instrumentations (HTTP, Fastify, Pino) register before the
 * adapters initialize (R2 mitigation from Task 2.9 spec).
 *
 * Configuration is read from env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT — default http://127.0.0.1:4318
 *   OTEL_SERVICE_NAME            — default "orch"
 *   OTEL_SERVICE_VERSION         — default "0.0.0" (overridden by readPackageVersion at runtime)
 *   ORCH_TRACE_BACKEND           — 'otlp' | 'langfuse' | 'none' (default 'otlp')
 *   LANGFUSE_OTLP_ENDPOINT       — required when ORCH_TRACE_BACKEND='langfuse'
 *   LANGFUSE_PUBLIC_KEY          — required when ORCH_TRACE_BACKEND='langfuse'
 *   LANGFUSE_SECRET_KEY          — required when ORCH_TRACE_BACKEND='langfuse'
 *
 * I-14: no module-level let/var — `endpoint`, `serviceName`, `serviceVersion` are
 * computed inline as consts and passed directly to bootstrapTracing().
 *
 * D2 note: This file reads raw env vars BEFORE validateEnv() runs (which lives in
 * ConfigModule.forRoot in app.module.ts). If ORCH_TRACE_BACKEND is set to an invalid
 * value (e.g. 'foo'), the factory's if/else chain falls through and traceExporter stays
 * undefined — effective behavior is 'none'. validateEnv() then crashes the daemon with
 * a clear zod error a few hundred milliseconds later. This two-step failure mode is
 * acceptable: the only consequence is "tracing transiently degrades to none during the
 * brief window before validateEnv crash". Do NOT duplicate validateEnv here (I-10).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  bootstrapTracing,
  type BootstrapTracingOpts,
  type TraceBackend,
} from './tracing-bootstrap.js';

// ── Read package version ───────────────────────────────────────────────────────

function readPackageVersion(): string {
  try {
    // Walk up from this file's location to find package.json
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ── Env-to-opts mapping (pure function — exported for unit tests) ─────────────

/**
 * Read bootstrap options from process env.
 *
 * This pure function is extracted from the module-level side effect so it can
 * be unit-tested without triggering Jest module-cache issues (D3: side-effect
 * imports are stateful across Jest workers; pure functions are not).
 *
 * I-10: reads raw env intentionally — validateEnv() runs AFTER this in app.module.ts.
 * I-1:  no LLM imports.
 *
 * @param env            The process environment (pass `process.env` in production).
 * @param packageVersion The semver string for service.version attribute.
 * @returns              BootstrapTracingOpts ready to pass to bootstrapTracing().
 */
export function readBootstrapOptsFromEnv(
  env: NodeJS.ProcessEnv,
  packageVersion: string,
): BootstrapTracingOpts {
  const traceBackend =
    (env['ORCH_TRACE_BACKEND'] as TraceBackend | undefined) ?? 'otlp';

  const langfuseEndpoint = env['LANGFUSE_OTLP_ENDPOINT'];
  const langfusePublicKey = env['LANGFUSE_PUBLIC_KEY'];
  const langfuseSecretKey = env['LANGFUSE_SECRET_KEY'];

  return {
    endpoint: env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://127.0.0.1:4318',
    serviceName: env['OTEL_SERVICE_NAME'] ?? 'orch',
    serviceVersion: packageVersion,
    traceBackend,
    // exactOptionalPropertyTypes: only spread when the value is defined (not undefined)
    ...(langfuseEndpoint !== undefined ? { langfuseEndpoint } : {}),
    ...(langfusePublicKey !== undefined ? { langfusePublicKey } : {}),
    ...(langfuseSecretKey !== undefined ? { langfuseSecretKey } : {}),
  };
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

bootstrapTracing(readBootstrapOptsFromEnv(process.env, readPackageVersion()));
