/**
 * env.schema.spec.ts — Zod env validation tests.
 *
 * Covers:
 *  - validateEnv rejects missing ORCH_HOOK_SECRET
 *  - validateEnv rejects missing ORCH_API_BEARER_TOKEN
 *  - validateEnv rejects empty ORCH_HOOK_SECRET
 *  - validateEnv accepts valid env and applies defaults
 *  - validateEnv rejects invalid ORCH_LOG_LEVEL
 */

import { validateEnv } from './env.schema.js';

const VALID_BASE = {
  ORCH_HOOK_SECRET: 'secret-abc',
  ORCH_API_BEARER_TOKEN: 'token-xyz',
};

describe('validateEnv', () => {
  describe('required fields', () => {
    it('throws when ORCH_HOOK_SECRET is missing', () => {
      const env = { ORCH_API_BEARER_TOKEN: 'token-xyz' };
      expect(() => validateEnv(env)).toThrow(/ORCH_HOOK_SECRET/);
    });

    it('throws when ORCH_API_BEARER_TOKEN is missing', () => {
      const env = { ORCH_HOOK_SECRET: 'secret-abc' };
      expect(() => validateEnv(env)).toThrow(/ORCH_API_BEARER_TOKEN/);
    });

    it('throws when ORCH_HOOK_SECRET is empty string', () => {
      const env = { ...VALID_BASE, ORCH_HOOK_SECRET: '' };
      expect(() => validateEnv(env)).toThrow(/ORCH_HOOK_SECRET/);
    });

    it('throws when ORCH_API_BEARER_TOKEN is empty string', () => {
      const env = { ...VALID_BASE, ORCH_API_BEARER_TOKEN: '' };
      expect(() => validateEnv(env)).toThrow(/ORCH_API_BEARER_TOKEN/);
    });

    it('throws when both required fields are missing', () => {
      expect(() => validateEnv({})).toThrow(/Environment validation failed/);
    });
  });

  describe('defaults', () => {
    it('applies default ORCH_HTTP_PORT of 4141', () => {
      const result = validateEnv(VALID_BASE);
      expect(result.ORCH_HTTP_PORT).toBe(4141);
    });

    it('applies default ORCH_HTTP_HOST of 127.0.0.1', () => {
      const result = validateEnv(VALID_BASE);
      expect(result.ORCH_HTTP_HOST).toBe('127.0.0.1');
    });

    it('applies default ORCH_HOME of ~/.orch', () => {
      const result = validateEnv(VALID_BASE);
      expect(result.ORCH_HOME).toBe('~/.orch');
    });

    it('applies default ORCH_LOG_LEVEL of info', () => {
      const result = validateEnv(VALID_BASE);
      expect(result.ORCH_LOG_LEVEL).toBe('info');
    });
  });

  describe('optional fields', () => {
    it('accepts OTEL_EXPORTER_OTLP_ENDPOINT when provided', () => {
      const env = {
        ...VALID_BASE,
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
      };
      const result = validateEnv(env);
      expect(result.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:4318');
    });

    it('leaves OTEL_EXPORTER_OTLP_ENDPOINT undefined when not provided', () => {
      const result = validateEnv(VALID_BASE);
      expect(result.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    });
  });

  describe('ORCH_LOG_LEVEL validation', () => {
    it('rejects invalid log level', () => {
      const env = { ...VALID_BASE, ORCH_LOG_LEVEL: 'verbose' };
      expect(() => validateEnv(env)).toThrow();
    });

    it('accepts all valid log levels', () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
      for (const level of levels) {
        const env = { ...VALID_BASE, ORCH_LOG_LEVEL: level };
        expect(validateEnv(env).ORCH_LOG_LEVEL).toBe(level);
      }
    });
  });

  describe('ORCH_HTTP_PORT coercion', () => {
    it('coerces string port to number', () => {
      const env = { ...VALID_BASE, ORCH_HTTP_PORT: '8080' };
      expect(validateEnv(env).ORCH_HTTP_PORT).toBe(8080);
    });
  });

  // ── Task 3.9 — ORCH_TRACE_BACKEND and Langfuse conditional refinement ────────

  describe('ORCH_TRACE_BACKEND', () => {
    it('defaults to otlp when not provided', () => {
      const result = validateEnv(VALID_BASE);
      expect(result.ORCH_TRACE_BACKEND).toBe('otlp');
    });

    it('accepts langfuse when all Langfuse credentials are present', () => {
      const env = {
        ...VALID_BASE,
        ORCH_TRACE_BACKEND: 'langfuse',
        LANGFUSE_OTLP_ENDPOINT: 'https://cloud.langfuse.com',
        LANGFUSE_PUBLIC_KEY: 'pk-lf-abc',
        LANGFUSE_SECRET_KEY: 'sk-lf-xyz',
      };
      const result = validateEnv(env);
      expect(result.ORCH_TRACE_BACKEND).toBe('langfuse');
      expect(result.LANGFUSE_OTLP_ENDPOINT).toBe('https://cloud.langfuse.com');
      expect(result.LANGFUSE_PUBLIC_KEY).toBe('pk-lf-abc');
      expect(result.LANGFUSE_SECRET_KEY).toBe('sk-lf-xyz');
    });

    it('accepts none and does not require Langfuse credentials', () => {
      const env = { ...VALID_BASE, ORCH_TRACE_BACKEND: 'none' };
      const result = validateEnv(env);
      expect(result.ORCH_TRACE_BACKEND).toBe('none');
      expect(result.LANGFUSE_OTLP_ENDPOINT).toBeUndefined();
    });

    it('rejects langfuse when LANGFUSE_OTLP_ENDPOINT is missing (zod superRefine)', () => {
      const env = {
        ...VALID_BASE,
        ORCH_TRACE_BACKEND: 'langfuse',
        LANGFUSE_PUBLIC_KEY: 'pk-lf-abc',
        LANGFUSE_SECRET_KEY: 'sk-lf-xyz',
        // LANGFUSE_OTLP_ENDPOINT intentionally absent
      };
      expect(() => validateEnv(env)).toThrow(/LANGFUSE_OTLP_ENDPOINT/);
    });

    it('rejects langfuse when LANGFUSE_PUBLIC_KEY is missing (zod superRefine)', () => {
      const env = {
        ...VALID_BASE,
        ORCH_TRACE_BACKEND: 'langfuse',
        LANGFUSE_OTLP_ENDPOINT: 'https://cloud.langfuse.com',
        LANGFUSE_SECRET_KEY: 'sk-lf-xyz',
        // LANGFUSE_PUBLIC_KEY intentionally absent
      };
      expect(() => validateEnv(env)).toThrow(/LANGFUSE_PUBLIC_KEY/);
    });

    it('rejects langfuse when LANGFUSE_SECRET_KEY is missing (zod superRefine)', () => {
      const env = {
        ...VALID_BASE,
        ORCH_TRACE_BACKEND: 'langfuse',
        LANGFUSE_OTLP_ENDPOINT: 'https://cloud.langfuse.com',
        LANGFUSE_PUBLIC_KEY: 'pk-lf-abc',
        // LANGFUSE_SECRET_KEY intentionally absent
      };
      expect(() => validateEnv(env)).toThrow(/LANGFUSE_SECRET_KEY/);
    });

    it('rejects an invalid ORCH_TRACE_BACKEND value', () => {
      const env = { ...VALID_BASE, ORCH_TRACE_BACKEND: 'jaeger' };
      expect(() => validateEnv(env)).toThrow();
    });
  });
});
