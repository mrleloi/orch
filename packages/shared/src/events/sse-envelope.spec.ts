/**
 * sse-envelope.spec.ts — Smoke tests for SseEnvelopeSchema and parseSseEnvelope.
 *
 * Covers:
 *  - Valid envelope parses correctly
 *  - Missing required fields rejected
 *  - Invalid trace_id format rejected (wrong hex length)
 *  - Invalid span_id format rejected
 *  - Invalid ts (not datetime) rejected
 *  - Unknown event type rejected
 *  - parseSseEnvelope returns undefined on invalid input
 *  - Optional fields (trace_id, span_id) accepted when absent
 */

import { describe, it, expect } from 'vitest';
import { SseEnvelopeSchema, parseSseEnvelope } from './sse-envelope.js';

const VALID_TRACE_ID = 'a'.repeat(32); // 32 hex chars
const VALID_SPAN_ID = 'b'.repeat(16);  // 16 hex chars
const VALID_TS = '2026-04-25T00:00:00.000Z';

describe('SseEnvelopeSchema', () => {
  it('parses a minimal valid envelope (no trace/span)', () => {
    const raw = {
      type: 'session.started',
      payload: { sessionId: 'sess_01' },
      ts: VALID_TS,
    };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('session.started');
    expect(result.data.trace_id).toBeUndefined();
    expect(result.data.span_id).toBeUndefined();
  });

  it('parses a full envelope with trace_id and span_id', () => {
    const raw = {
      type: 'hook.received',
      payload: { event: 'UserPromptSubmit' },
      trace_id: VALID_TRACE_ID,
      span_id: VALID_SPAN_ID,
      ts: VALID_TS,
    };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.trace_id).toBe(VALID_TRACE_ID);
    expect(result.data.span_id).toBe(VALID_SPAN_ID);
  });

  it('rejects missing type field', () => {
    const raw = { payload: {}, ts: VALID_TS };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects unknown event type', () => {
    const raw = { type: 'not.a.valid.event', payload: {}, ts: VALID_TS };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects missing ts field', () => {
    const raw = { type: 'queue.enqueued', payload: {} };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects ts that is not an ISO datetime', () => {
    const raw = { type: 'session.ended', payload: {}, ts: 'not-a-date' };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects trace_id that is not 32 hex chars', () => {
    const raw = {
      type: 'session.started',
      payload: {},
      trace_id: 'tooshort',
      ts: VALID_TS,
    };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects span_id that is not 16 hex chars', () => {
    const raw = {
      type: 'session.started',
      payload: {},
      span_id: 'xyz', // not valid hex
      ts: VALID_TS,
    };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('accepts payload as any JSON value (unknown type)', () => {
    const raw = {
      type: 'operator.action',
      payload: [1, 2, 'three', { nested: true }],
      ts: VALID_TS,
    };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('accepts null payload', () => {
    const raw = { type: 'project.registered', payload: null, ts: VALID_TS };
    const result = SseEnvelopeSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

describe('parseSseEnvelope', () => {
  it('returns parsed envelope for valid input', () => {
    const raw = { type: 'session.ended', payload: { reason: 'completed' }, ts: VALID_TS };
    const envelope = parseSseEnvelope(raw);
    expect(envelope).toBeDefined();
    expect(envelope?.type).toBe('session.ended');
  });

  it('returns undefined for invalid input', () => {
    expect(parseSseEnvelope({ type: 'bad.type', payload: {}, ts: VALID_TS })).toBeUndefined();
    expect(parseSseEnvelope(null)).toBeUndefined();
    expect(parseSseEnvelope('not an object')).toBeUndefined();
    expect(parseSseEnvelope(42)).toBeUndefined();
  });

  it('returns undefined for missing required field', () => {
    expect(parseSseEnvelope({ type: 'session.started', payload: {} })).toBeUndefined();
  });
});
