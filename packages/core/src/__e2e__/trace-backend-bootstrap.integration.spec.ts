/**
 * trace-backend-bootstrap.integration.spec.ts — Task 3.9 E.3
 *
 * Integration smoke tests: full bootstrap → NodeSDK.start() → span emit → shutdown
 * lifecycle for each ORCH_TRACE_BACKEND value ('otlp', 'langfuse', 'none').
 *
 * WHY INTEGRATION (not unit):
 *   These tests exercise the full bootstrap+SDK+shutdown cycle, not just opts shaping.
 *   They live in __e2e__/ and run under `pnpm test:integration` (*.integration.spec.ts
 *   pattern) — parallel to tracing-http-propagation.integration.spec.ts.
 *
 * STRATEGY (plan §C.3):
 *   - Use readBootstrapOptsFromEnv() + bootstrapTracing() directly (same path as the
 *     module-level side effect in tracing-bootstrap-startup.ts).
 *   - No real network: all OTLP endpoints point to 127.0.0.1:1 (closed port).
 *     I-13: exporter retries silently per R5 — no unhandled rejection.
 *   - For 'langfuse' backend: LANGFUSE_OTLP_ENDPOINT='http://127.0.0.1:1' (closed port),
 *     fake key pair. Asserts SDK starts without throwing — not actual Langfuse cloud.
 *   - For 'none' backend: asserts no crash + getStartedSdk() non-null (in-process
 *     SpanProcessors still function — verified separately in tracing-bootstrap.spec.ts).
 *   - Each iteration: _resetSdkForTest() before + shutdownTracing() after.
 *
 * RISK 2 MITIGATION (plan §Risks): each it() block calls _resetSdkForTest() +
 *   shutdownTracing() in beforeEach/afterEach so iterations don't pollute each other.
 *
 * I-1: zero LLM imports.
 * I-13: no real network.
 * I-15: no gen_ai.* attribute names.
 */

import { trace } from '@opentelemetry/api';
import {
  bootstrapTracing,
  shutdownTracing,
  _resetSdkForTest,
  getStartedSdk,
} from '../tracing-bootstrap.js';
import { readBootstrapOptsFromEnv } from '../tracing-bootstrap-startup.js';

// ── Shared constants ──────────────────────────────────────────────────────────

const PKG_VERSION = '0.0.0';
const CLOSED_PORT_URL = 'http://127.0.0.1:1'; // unreachable — exporter fails silently (R5)

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

// Save and restore env vars that the tests mutate
const MUTATED_KEYS = [
  'ORCH_TRACE_BACKEND',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'LANGFUSE_OTLP_ENDPOINT',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
] as const;

let savedEnv: Partial<Record<string, string>> = {};

beforeEach(() => {
  // Save current values before each test
  savedEnv = {};
  for (const key of MUTATED_KEYS) {
    savedEnv[key] = process.env[key];
  }
  // Reset SDK singleton so each test starts clean
  _resetSdkForTest();
});

afterEach(async () => {
  // Shutdown the SDK (flushes in-flight spans, resets provider)
  await shutdownTracing();
  _resetSdkForTest();
  // Restore env vars
  for (const key of MUTATED_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ── Integration smoke tests ───────────────────────────────────────────────────

describe('trace-backend-bootstrap integration smoke', () => {
  it(
    'otlp backend: bootstraps SDK, emits span, shuts down without throwing',
    async () => {
      // Arrange
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ORCH_TRACE_BACKEND: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: CLOSED_PORT_URL,
      };

      const opts = readBootstrapOptsFromEnv(env, PKG_VERSION);

      // Act — bootstrap
      expect(() => bootstrapTracing(opts)).not.toThrow();
      expect(getStartedSdk()).not.toBeNull();

      // Act — emit a span (smoke only; exporter will retry silently)
      const apiTracer = trace.getTracer('boot-smoke-otlp');
      const span = apiTracer.startSpan('boot-smoke');
      span.end();

      // Act — shutdown (must resolve within timeout; I-13: no real network flush)
      await expect(shutdownTracing()).resolves.toBeUndefined();
    },
    10_000,
  );

  it(
    'langfuse backend: bootstraps SDK with fake credentials, emits span, shuts down without throwing',
    async () => {
      // Arrange — fake Langfuse credentials pointing at closed port (no real network)
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ORCH_TRACE_BACKEND: 'langfuse',
        OTEL_EXPORTER_OTLP_ENDPOINT: CLOSED_PORT_URL,
        LANGFUSE_OTLP_ENDPOINT: CLOSED_PORT_URL,
        LANGFUSE_PUBLIC_KEY: 'pk-test',
        LANGFUSE_SECRET_KEY: 'sk-test',
      };

      const opts = readBootstrapOptsFromEnv(env, PKG_VERSION);

      // Act — bootstrap
      expect(() => bootstrapTracing(opts)).not.toThrow();
      expect(getStartedSdk()).not.toBeNull();

      // Act — emit a span
      const apiTracer = trace.getTracer('boot-smoke-langfuse');
      const span = apiTracer.startSpan('boot-smoke');
      span.end();

      // Act — shutdown
      await expect(shutdownTracing()).resolves.toBeUndefined();
    },
    10_000,
  );

  it(
    'none backend: bootstraps SDK without remote exporter, emits span, shuts down without throwing',
    async () => {
      // Arrange — no remote exporter; in-process processors still function
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ORCH_TRACE_BACKEND: 'none',
        OTEL_EXPORTER_OTLP_ENDPOINT: CLOSED_PORT_URL,
      };

      const opts = readBootstrapOptsFromEnv(env, PKG_VERSION);

      // Act — bootstrap
      expect(() => bootstrapTracing(opts)).not.toThrow();
      expect(getStartedSdk()).not.toBeNull();

      // Act — emit a span (no exporter, but SDK still registered — spans flow to
      // in-process SpanProcessors like ContextBudgetSpanProcessor)
      const apiTracer = trace.getTracer('boot-smoke-none');
      const span = apiTracer.startSpan('boot-smoke');
      span.end();

      // Act — shutdown
      await expect(shutdownTracing()).resolves.toBeUndefined();
    },
    10_000,
  );
});
