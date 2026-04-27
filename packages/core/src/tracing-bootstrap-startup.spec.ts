/**
 * tracing-bootstrap-startup.spec.ts — Unit tests for readBootstrapOptsFromEnv()
 *
 * Tests the pure function extracted from tracing-bootstrap-startup.ts (Task 3.9 E.1
 * refactor). Exercises env → BootstrapTracingOpts mapping for all three backends.
 *
 * Strategy (D3): we test readBootstrapOptsFromEnv() as a pure function to avoid
 * Jest module-cache issues from importing the startup side-effect module directly.
 * The module-level bootstrapTracing() call runs once per Jest worker on first import.
 * Calling the pure function directly avoids SDK singleton state pollution across tests.
 *
 * Test cases:
 *  1. ORCH_TRACE_BACKEND unset → defaults to 'otlp' in opts
 *  2. ORCH_TRACE_BACKEND='langfuse' + all Langfuse vars → opts contain all four fields
 *  3. ORCH_TRACE_BACKEND='langfuse' + keys missing → bootstrapTracing throws (defense-in-depth)
 *  4. ORCH_TRACE_BACKEND='none' → opts contain traceBackend='none'; bootstrap completes
 *
 * I-10: startup module reads raw env (validated by validateEnv later). Tests set env
 * permutations directly without needing full zod validation.
 * I-1: zero LLM imports.
 */

import {
  bootstrapTracing,
  shutdownTracing,
  _resetSdkForTest,
  getStartedSdk,
} from './tracing-bootstrap.js';
import { readBootstrapOptsFromEnv } from './tracing-bootstrap-startup.js';

const PKG_VERSION = '0.0.0';
const FAKE_ENDPOINT = 'http://127.0.0.1:4318';

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

beforeEach(() => {
  _resetSdkForTest();
});

afterEach(async () => {
  await shutdownTracing();
  _resetSdkForTest();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('readBootstrapOptsFromEnv()', () => {
  it('defaults traceBackend to "otlp" when ORCH_TRACE_BACKEND is unset', () => {
    const env: NodeJS.ProcessEnv = {
      OTEL_EXPORTER_OTLP_ENDPOINT: FAKE_ENDPOINT,
    };

    const opts = readBootstrapOptsFromEnv(env, PKG_VERSION);

    expect(opts.traceBackend).toBe('otlp');
    expect(opts.endpoint).toBe(FAKE_ENDPOINT);
    expect(opts.serviceVersion).toBe(PKG_VERSION);
  });

  it('passes langfuse credentials through when ORCH_TRACE_BACKEND="langfuse" and all vars are set', () => {
    const env: NodeJS.ProcessEnv = {
      OTEL_EXPORTER_OTLP_ENDPOINT: FAKE_ENDPOINT,
      ORCH_TRACE_BACKEND: 'langfuse',
      LANGFUSE_OTLP_ENDPOINT: 'https://cloud.langfuse.com',
      LANGFUSE_PUBLIC_KEY: 'pk-test',
      LANGFUSE_SECRET_KEY: 'sk-test',
    };

    const opts = readBootstrapOptsFromEnv(env, PKG_VERSION);

    expect(opts.traceBackend).toBe('langfuse');
    expect(opts.langfuseEndpoint).toBe('https://cloud.langfuse.com');
    expect(opts.langfusePublicKey).toBe('pk-test');
    expect(opts.langfuseSecretKey).toBe('sk-test');
  });

  it('bootstrapTracing throws when ORCH_TRACE_BACKEND="langfuse" but Langfuse keys are missing', () => {
    // This tests the defense-in-depth guard in tracing-bootstrap.ts:170-174.
    // In production, superRefine catches this first; when bootstrapTracing() is called
    // directly (e.g. from tests), the factory itself throws a clear error.
    const env: NodeJS.ProcessEnv = {
      OTEL_EXPORTER_OTLP_ENDPOINT: FAKE_ENDPOINT,
      ORCH_TRACE_BACKEND: 'langfuse',
      // langfuseEndpoint / langfusePublicKey / langfuseSecretKey intentionally absent
    };

    const opts = readBootstrapOptsFromEnv(env, PKG_VERSION);

    // opts.traceBackend is 'langfuse' but credentials are missing — factory throws
    expect(() => bootstrapTracing(opts)).toThrow(
      /traceBackend=langfuse requires/,
    );
  });

  it('ORCH_TRACE_BACKEND="none" → opts have traceBackend=none; bootstrap completes without throwing', () => {
    const env: NodeJS.ProcessEnv = {
      OTEL_EXPORTER_OTLP_ENDPOINT: FAKE_ENDPOINT,
      ORCH_TRACE_BACKEND: 'none',
    };

    const opts = readBootstrapOptsFromEnv(env, PKG_VERSION);

    expect(opts.traceBackend).toBe('none');

    // Bootstrap should complete without throwing (no remote exporter for 'none')
    expect(() => bootstrapTracing(opts)).not.toThrow();

    // SDK starts successfully — in-process processors still work
    expect(getStartedSdk()).not.toBeNull();
  });
});
