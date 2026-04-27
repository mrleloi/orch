/**
 * tracing-bootstrap.ts — OTEL NodeSDK factory.
 *
 * Must be called BEFORE NestFactory.create() so that auto-instrumentations
 * (HTTP, Fastify, Pino) can hook into Node.js internals before the adapters
 * initialize.
 *
 * D7 (SYNTHESIS): W3C trace-context propagation is the default in @opentelemetry/api.
 * We call CompositePropagator with W3CTraceContextPropagator + W3CBaggagePropagator
 * explicitly so it is unambiguous in the logs.
 *
 * R1 mitigation: we use getNodeAutoInstrumentations but disable every instrumentation
 * that creates noise in tests (fs, dns, net, express, nestjs-core). HTTP + Fastify +
 * Pino are the three we need for I-9 (trace_id in every HTTP-request log line).
 *
 * R4 mitigation: this file owns the single NodeSDK instance. TracingModule is changed
 * to NOT create a second SDK — it delegates to this module's started SDK instead.
 *
 * Task 3.9 — Langfuse Backend Toggle (decisions/005-trace-backend-toggle.md):
 *  traceBackend = 'otlp' (default): OTLP HTTP exporter → OTEL_EXPORTER_OTLP_ENDPOINT.
 *  traceBackend = 'langfuse': OTLP HTTP exporter → LANGFUSE_OTLP_ENDPOINT with
 *    HTTP Basic auth (base64(<public_key>:<secret_key>)). Langfuse's OTLP endpoint
 *    accepts standard OTLP HTTP with an Authorization: Basic header — same wire
 *    protocol, different URL + auth. See https://langfuse.com/docs/opentelemetry/get-started
 *  traceBackend = 'none': no exporter created. In-process SpanProcessors
 *    (ContextBudgetSpanProcessor) still receive spans via the active NodeSDK provider.
 *
 * Env vars honoured:
 *  OTEL_EXPORTER_OTLP_ENDPOINT — default http://127.0.0.1:4318
 *  OTEL_SERVICE_NAME            — overrides serviceName option
 *  OTEL_METRICS_EXPORTER        — if unset or 'otlp', forced to 'none' (Phase 2 fix;
 *                                  avoids exportIntervalMillis crash)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
} from '@opentelemetry/core';

// ── Semantic convention constants ─────────────────────────────────────────────

const ATTR_SERVICE_NAME = 'service.name' as const;
const ATTR_SERVICE_VERSION = 'service.version' as const;

// ── Options ────────────────────────────────────────────────────────────────────

/** Trace backend selector — see decisions/005-trace-backend-toggle.md */
export type TraceBackend = 'otlp' | 'langfuse' | 'none';

export interface BootstrapTracingOpts {
  /** OTLP HTTP endpoint, e.g. "http://127.0.0.1:4318". */
  endpoint: string;
  /** OTel service.name attribute. */
  serviceName: string;
  /** OTel service.version attribute. */
  serviceVersion: string;
  /**
   * Trace backend selector (default: 'otlp').
   *  'otlp'     — OTLP HTTP to endpoint (Grafana LGTM / Tempo default)
   *  'langfuse' — OTLP HTTP to langfuse.endpoint with Basic auth
   *  'none'     — no remote exporter; in-process processors still run
   */
  traceBackend?: TraceBackend;
  /** Langfuse OTLP ingest URL. Required when traceBackend='langfuse'. */
  langfuseEndpoint?: string;
  /** Langfuse public key. Required when traceBackend='langfuse'. */
  langfusePublicKey?: string;
  /** Langfuse secret key. Required when traceBackend='langfuse'. */
  langfuseSecretKey?: string;
}

// ── Langfuse auth helper ───────────────────────────────────────────────────────

/**
 * Build the Authorization header value for Langfuse OTLP ingest.
 *
 * Langfuse accepts OTLP HTTP with HTTP Basic auth where:
 *   username = LANGFUSE_PUBLIC_KEY
 *   password = LANGFUSE_SECRET_KEY
 *
 * Header format: "Basic <base64(publicKey:secretKey)>"
 * Reference: https://langfuse.com/docs/opentelemetry/get-started
 *
 * I-1: no LLM calls; pure string manipulation.
 */
export function buildLangfuseAuthHeader(
  publicKey: string,
  secretKey: string,
): string {
  const credentials = `${publicKey}:${secretKey}`;
  const encoded = Buffer.from(credentials).toString('base64');
  return `Basic ${encoded}`;
}

// ── Singleton guard ────────────────────────────────────────────────────────────

/**
 * Singleton holder object (a const) whose `sdk` property is mutated.
 *
 * I-14 allows mutation via a const container object; it forbids bare module-level
 * `let` / `var` declarations. This is the established pattern for module-scoped
 * singleton state in this codebase (see OTEL_METRICS_EXPORTER guard in fix B).
 *
 * The holder is only mutated by bootstrapTracing() and shutdownTracing().
 */
const sdkHolder: { sdk: NodeSDK | null } = { sdk: null };

/**
 * Return the already-started SDK, or null if bootstrapTracing has not been
 * called yet. Used by TracingModule to avoid creating a second SDK.
 */
export function getStartedSdk(): NodeSDK | null {
  return sdkHolder.sdk;
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

/**
 * Create and START a NodeSDK with OTLP HTTP exporter + targeted auto-instrumentations.
 *
 * Idempotent: if called twice, the second call returns the existing SDK without
 * starting a second provider. This protects against accidental double-import.
 *
 * MUST be called at the very top of main.ts, before NestFactory.create(), so that
 * HTTP and Fastify instrumentations register before the adapters initialize (R2).
 *
 * @param opts  Bootstrap options (endpoint, serviceName, serviceVersion).
 * @returns     The started NodeSDK instance.
 */
export function bootstrapTracing(opts: BootstrapTracingOpts): NodeSDK {
  // Idempotency guard (R4: single provider only)
  if (sdkHolder.sdk !== null) {
    return sdkHolder.sdk;
  }

  // Metrics crash guard: sdk-node 0.57.x creates PeriodicExportingMetricReader
  // from env vars whose defaults produce exportIntervalMillis < exportTimeoutMillis.
  // Force 'none' unless the operator explicitly opted-in to a non-otlp exporter.
  const existingMetricsExporter = process.env['OTEL_METRICS_EXPORTER'];
  if (!existingMetricsExporter || existingMetricsExporter === 'otlp') {
    process.env['OTEL_METRICS_EXPORTER'] = 'none';
  }

  // ── Exporter factory — Task 3.9 trace backend branching ───────────────────
  //
  // 'otlp' (default): standard OTLP HTTP to OTEL_EXPORTER_OTLP_ENDPOINT.
  // 'langfuse': OTLP HTTP to Langfuse endpoint with Basic auth header.
  //             Uses the same OTLP wire protocol — just different URL + auth.
  //             No @langfuse/* SDK dependency needed (Karpathy P2).
  // 'none': no remote exporter. NodeSDK still starts (needed for in-process
  //         SpanProcessors like ContextBudgetSpanProcessor from Task 3.2).
  const backend: TraceBackend = opts.traceBackend ?? 'otlp';

  let traceExporter: OTLPTraceExporter | undefined;

  if (backend === 'otlp') {
    traceExporter = new OTLPTraceExporter({
      url: `${opts.endpoint}/v1/traces`,
    });
  } else if (backend === 'langfuse') {
    // Langfuse credentials must be present (validated by envSchema superRefine).
    // If missing here it means bootstrapTracing was called directly without going
    // through validateEnv — fail fast with a clear error.
    const { langfuseEndpoint, langfusePublicKey, langfuseSecretKey } = opts;
    if (!langfuseEndpoint || !langfusePublicKey || !langfuseSecretKey) {
      throw new Error(
        'traceBackend=langfuse requires langfuseEndpoint, langfusePublicKey, and langfuseSecretKey',
      );
    }
    traceExporter = new OTLPTraceExporter({
      url: `${langfuseEndpoint}/v1/traces`,
      headers: {
        Authorization: buildLangfuseAuthHeader(
          langfusePublicKey,
          langfuseSecretKey,
        ),
      },
    });
  }
  // 'none': traceExporter remains undefined — NodeSDK starts without a remote exporter.

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: opts.serviceName,
      [ATTR_SERVICE_VERSION]: opts.serviceVersion,
    }),
    // Only spread traceExporter when defined — exactOptionalPropertyTypes requires
    // we do NOT pass `undefined` for a required property.
    ...(traceExporter !== undefined ? { traceExporter } : {}),
    // W3C propagators registered explicitly for clarity (D7)
    textMapPropagator: new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    }),
    // R1 mitigation: targeted whitelist — only HTTP + Fastify + Pino enabled.
    // All others disabled to prevent test noise (e.g. fs spans on readFileSync).
    instrumentations: [
      getNodeAutoInstrumentations({
        // Keep only the three we need for I-9 HTTP-level trace_id propagation
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-pino': { enabled: true },
        // Disable everything else (noisy / not needed in Phase 2)
        '@opentelemetry/instrumentation-express': { enabled: false },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: false },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-grpc': { enabled: false },
        '@opentelemetry/instrumentation-socket.io': { enabled: false },
        '@opentelemetry/instrumentation-mongodb': { enabled: false },
        '@opentelemetry/instrumentation-mysql': { enabled: false },
        '@opentelemetry/instrumentation-mysql2': { enabled: false },
        '@opentelemetry/instrumentation-pg': { enabled: false },
        '@opentelemetry/instrumentation-redis': { enabled: false },
        '@opentelemetry/instrumentation-ioredis': { enabled: false },
        '@opentelemetry/instrumentation-aws-sdk': { enabled: false },
        '@opentelemetry/instrumentation-bunyan': { enabled: false },
        '@opentelemetry/instrumentation-winston': { enabled: false },
        '@opentelemetry/instrumentation-connect': { enabled: false },
        '@opentelemetry/instrumentation-hapi': { enabled: false },
        '@opentelemetry/instrumentation-koa': { enabled: false },
        '@opentelemetry/instrumentation-knex': { enabled: false },
      }),
    ],
  });

  sdk.start();
  sdkHolder.sdk = sdk;
  return sdk;
}

/**
 * Shut down the started SDK. Called by TracingModule.onModuleDestroy so
 * a clean shutdown flushes in-flight spans.
 *
 * Safe to call even if bootstrapTracing was never called.
 */
export async function shutdownTracing(): Promise<void> {
  if (sdkHolder.sdk !== null) {
    await sdkHolder.sdk.shutdown();
    sdkHolder.sdk = null;
  }
}

/**
 * Reset the singleton — TEST ONLY. Allows repeated bootstrap in unit tests.
 *
 * @internal
 */
export function _resetSdkForTest(): void {
  sdkHolder.sdk = null;
}
