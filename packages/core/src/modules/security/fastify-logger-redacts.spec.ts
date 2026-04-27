/**
 * fastify-logger-redacts.spec.ts
 *
 * Smoke-tests that a pino instance configured with our redactLogObject formatter
 * and createPinoOtelMixin correctly redacts secrets in log output.
 *
 * We construct a pino instance exactly as main.ts does (same options) and write
 * a log entry containing a known API key. The output (captured via a destination
 * stream) must contain [REDACTED] and must NOT contain the raw key.
 */

import { Writable } from 'node:stream';
import pino from 'pino';
import { createPinoOtelMixin } from '../tracing/pino-otel.js';
import { redactLogObject } from './redact-log-object.js';

/** Build a pino logger that writes to an in-memory string buffer. */
function buildTestLogger(): { logger: pino.Logger; getOutput: () => string } {
  let output = '';
  const dest = new Writable({
    write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
      output += chunk.toString();
      cb();
    },
  });

  const logger = pino(
    {
      level: 'info',
      mixin: createPinoOtelMixin(),
      formatters: {
        log: (obj: Record<string, unknown>) => redactLogObject(obj),
      },
    },
    dest,
  );

  return { logger, getOutput: () => output };
}

describe('fastify-logger redaction smoke test', () => {
  it('redacts an Anthropic API key emitted in a log record', () => {
    const { logger, getOutput } = buildTestLogger();

    logger.info({
      msg: 'test log',
      token: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
    });

    const output = getOutput();
    expect(output).not.toContain('sk-ant-api03');
    expect(output).toContain('[REDACTED]');
  });

  it('redacts a Bearer token emitted in a log record', () => {
    const { logger, getOutput } = buildTestLogger();

    logger.info({
      msg: 'auth log',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
    });

    const output = getOutput();
    expect(output).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(output).toContain('[REDACTED]');
  });

  it('preserves safe fields while redacting secrets', () => {
    const { logger, getOutput } = buildTestLogger();

    logger.info({
      msg: 'mixed log',
      level: 'info',
      sessionId: 'session-abc-123',
      apiKey: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
    });

    const output = getOutput();
    expect(output).toContain('session-abc-123');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('sk-ant-api03');
  });

  it('pino instance includes mixin keys when logged outside span (no trace_id)', () => {
    const { logger, getOutput } = buildTestLogger();

    logger.info({ msg: 'outside span' });

    const output = getOutput();
    // Outside span: mixin returns {}, so trace_id should NOT be present
    const parsed = JSON.parse(output.trim().split('\n')[0] ?? '{}') as Record<string, unknown>;
    expect(parsed['trace_id']).toBeUndefined();
  });
});
