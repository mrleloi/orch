/**
 * env-propagation.spec.ts — unit tests for buildPropagatedEnv() helper.
 *
 * I-14: pure functions tested directly — no mocks, no subprocess, no DI.
 * Coverage targets per architect §5.4:
 *  1. Literal var family — each named var propagated when present
 *  2. Prefix-glob — all OTEL_EXPORTER_OTLP_* keys propagated
 *  3. Override semantics — caller extraEnv wins over parent env
 *  4. Absent var omitted from output
 *  5. No parent vars → empty env (extraEnv-only)
 */

import {
  buildPropagatedEnv,
  PROPAGATED_ENV_VARS,
  PROPAGATED_ENV_PREFIXES,
} from './env-propagation.js';

describe('buildPropagatedEnv', () => {
  // ── 1. Literal var family ──────────────────────────────────────────────────

  describe('literal var propagation', () => {
    it.each([
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'NO_PROXY',
      'CLAUDE_CODE_REMOTE',
      'TRACEPARENT',
    ] as const)(
      'propagates %s when present in parentEnv',
      (varName) => {
        const parentEnv: NodeJS.ProcessEnv = { [varName]: 'test-value-123' };
        const result = buildPropagatedEnv(parentEnv, undefined);
        expect(result[varName]).toBe('test-value-123');
      },
    );

    it('propagates all 7 literal vars when all are set', () => {
      const parentEnv: NodeJS.ProcessEnv = {};
      for (const key of PROPAGATED_ENV_VARS) {
        parentEnv[key] = `val-${key}`;
      }
      const result = buildPropagatedEnv(parentEnv, undefined);
      for (const key of PROPAGATED_ENV_VARS) {
        expect(result[key]).toBe(`val-${key}`);
      }
    });
  });

  // ── 2. Prefix-glob (OTEL_EXPORTER_OTLP_*) ─────────────────────────────────

  describe('OTEL_EXPORTER_OTLP_* prefix-glob', () => {
    it('propagates all OTEL_EXPORTER_OTLP_* keys present in parentEnv', () => {
      const parentEnv: NodeJS.ProcessEnv = {
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4317',
        OTEL_EXPORTER_OTLP_HEADERS: 'auth=secret',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
      };
      const result = buildPropagatedEnv(parentEnv, undefined);
      expect(result['OTEL_EXPORTER_OTLP_ENDPOINT']).toBe('http://otel:4317');
      expect(result['OTEL_EXPORTER_OTLP_HEADERS']).toBe('auth=secret');
      expect(result['OTEL_EXPORTER_OTLP_PROTOCOL']).toBe('grpc');
    });

    it('propagates future OTLP keys not in PROPAGATED_ENV_VARS (prefix-glob forward compat)', () => {
      const parentEnv: NodeJS.ProcessEnv = {
        OTEL_EXPORTER_OTLP_INSECURE: 'true',
        OTEL_EXPORTER_OTLP_COMPRESSION: 'gzip',
      };
      const result = buildPropagatedEnv(parentEnv, undefined);
      expect(result['OTEL_EXPORTER_OTLP_INSECURE']).toBe('true');
      expect(result['OTEL_EXPORTER_OTLP_COMPRESSION']).toBe('gzip');
    });

    it('does NOT propagate non-matching env keys', () => {
      const parentEnv: NodeJS.ProcessEnv = {
        PATH: '/usr/bin',
        HOME: '/home/user',
        SECRET_KEY: 'top-secret',
      };
      const result = buildPropagatedEnv(parentEnv, undefined);
      expect(result['PATH']).toBeUndefined();
      expect(result['HOME']).toBeUndefined();
      expect(result['SECRET_KEY']).toBeUndefined();
    });
  });

  // ── 3. Override semantics ──────────────────────────────────────────────────

  describe('override semantics', () => {
    it('extraEnv takes precedence over parentEnv for literal vars', () => {
      const parentEnv: NodeJS.ProcessEnv = { HTTPS_PROXY: 'parent-proxy' };
      const result = buildPropagatedEnv(parentEnv, { HTTPS_PROXY: 'override-proxy' });
      expect(result['HTTPS_PROXY']).toBe('override-proxy');
    });

    it('extraEnv takes precedence over parentEnv for OTLP prefix-glob vars', () => {
      const parentEnv: NodeJS.ProcessEnv = {
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://parent:4317',
      };
      const result = buildPropagatedEnv(parentEnv, {
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://override:4317',
      });
      expect(result['OTEL_EXPORTER_OTLP_ENDPOINT']).toBe('http://override:4317');
    });

    it('extraEnv keys not in propagation lists are included in output', () => {
      const parentEnv: NodeJS.ProcessEnv = {};
      const result = buildPropagatedEnv(parentEnv, { CUSTOM_VAR: 'custom-value' });
      expect(result['CUSTOM_VAR']).toBe('custom-value');
    });
  });

  // ── 4. Absent var omitted from output ─────────────────────────────────────

  describe('absent var omitted', () => {
    it('omits literal vars absent from parentEnv', () => {
      const parentEnv: NodeJS.ProcessEnv = {};
      const result = buildPropagatedEnv(parentEnv, undefined);
      for (const key of PROPAGATED_ENV_VARS) {
        expect(result[key]).toBeUndefined();
      }
    });

    it('omits OTLP vars when no OTLP keys in parentEnv', () => {
      const parentEnv: NodeJS.ProcessEnv = { TRACEPARENT: 'some-trace-id' };
      const result = buildPropagatedEnv(parentEnv, undefined);
      // Only TRACEPARENT should be present; no spurious OTLP keys
      expect(Object.keys(result)).toEqual(['TRACEPARENT']);
    });
  });

  // ── 5. No parent vars → extraEnv-only output ──────────────────────────────

  describe('no parent vars', () => {
    it('yields empty object when parentEnv is empty and extraEnv is undefined', () => {
      const result = buildPropagatedEnv({}, undefined);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('yields only extraEnv keys when parentEnv is empty', () => {
      const result = buildPropagatedEnv({}, { MY_VAR: 'hello', OTHER: 'world' });
      expect(result).toEqual({ MY_VAR: 'hello', OTHER: 'world' });
    });
  });

  // ── PROPAGATED_ENV_PREFIXES constant ──────────────────────────────────────

  describe('exported constants', () => {
    it('PROPAGATED_ENV_VARS contains exactly 7 named vars', () => {
      expect(PROPAGATED_ENV_VARS).toHaveLength(7);
    });

    it('PROPAGATED_ENV_PREFIXES contains the OTLP prefix', () => {
      expect(PROPAGATED_ENV_PREFIXES).toContain('OTEL_EXPORTER_OTLP_');
    });
  });
});
