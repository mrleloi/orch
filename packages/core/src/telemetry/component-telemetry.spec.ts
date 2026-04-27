import {
  ComponentEventSchema,
  parseTelemetryLine,
} from './component-telemetry.schema';

// Minimal valid event used as a base for mutations
const VALID_EVENT = {
  ts: '2026-04-27T10:00:00.000Z',
  component_type: 'skill' as const,
  component_name: 'research-first',
  trigger: 'keyword_match' as const,
  outcome: 'ok' as const,
  duration_ms: 12,
  session_id: 'session-abc',
  task_id: null,
  failure_mode: null,
};

describe('ComponentEventSchema', () => {
  // Case 1: parses a fully-valid event
  it('parses a valid event with all required fields', () => {
    const result = ComponentEventSchema.parse(VALID_EVENT);
    expect(result.component_type).toBe('skill');
    expect(result.component_name).toBe('research-first');
    expect(result.trigger).toBe('keyword_match');
  });

  // Case 2: parses optional fields when present
  it('parses optional fields tokens_self, tokens_real, decision', () => {
    const result = ComponentEventSchema.parse({
      ...VALID_EVENT,
      tokens_self: 100,
      tokens_real: 200,
      decision: 'approve',
    });
    expect(result.tokens_self).toBe(100);
    expect(result.tokens_real).toBe(200);
    expect(result.decision).toBe('approve');
  });

  // Case 3: rejects unknown fields (strict mode)
  it('rejects unknown fields (strict schema)', () => {
    expect(() =>
      ComponentEventSchema.parse({ ...VALID_EVENT, unknown_field: 'x' }),
    ).toThrow();
  });

  // Case 4: rejects invalid component_type
  it('rejects invalid component_type value', () => {
    expect(() =>
      ComponentEventSchema.parse({
        ...VALID_EVENT,
        component_type: 'invalid_type',
      }),
    ).toThrow();
  });

  // Case 5: rejects negative duration_ms
  it('rejects negative duration_ms', () => {
    expect(() =>
      ComponentEventSchema.parse({ ...VALID_EVENT, duration_ms: -1 }),
    ).toThrow();
  });

  // Case 6: rejects invalid trigger value
  it('rejects invalid trigger value', () => {
    expect(() =>
      ComponentEventSchema.parse({
        ...VALID_EVENT,
        trigger: 'not_a_trigger',
      }),
    ).toThrow();
  });

  // Case 7: accepts null session_id and task_id
  it('accepts null session_id and null task_id', () => {
    const result = ComponentEventSchema.parse({
      ...VALID_EVENT,
      session_id: null,
      task_id: null,
    });
    expect(result.session_id).toBeNull();
    expect(result.task_id).toBeNull();
  });

  // Case 8: accepts all valid failure_mode enum values
  it('accepts all valid failure_mode values (A..G)', () => {
    for (const fm of ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const) {
      const result = ComponentEventSchema.parse({
        ...VALID_EVENT,
        failure_mode: fm,
      });
      expect(result.failure_mode).toBe(fm);
    }
  });
});

describe('parseTelemetryLine', () => {
  // Case 9: returns null on malformed JSON
  it('returns null for malformed JSON input', () => {
    expect(parseTelemetryLine('{ this is not json }')).toBeNull();
  });

  // Case 10: returns null for empty string
  it('returns null for empty string', () => {
    expect(parseTelemetryLine('')).toBeNull();
  });

  // Case 11: returns valid event on canonical JSONL line
  it('returns valid ComponentEvent on a canonical JSONL line', () => {
    const line = JSON.stringify(VALID_EVENT);
    const result = parseTelemetryLine(line);
    expect(result).not.toBeNull();
    expect(result?.component_type).toBe('skill');
  });

  // Case 12: round-trip serialization preserves all fields
  it('round-trip: parse → stringify → parse returns identical shape', () => {
    const first = parseTelemetryLine(JSON.stringify(VALID_EVENT));
    expect(first).not.toBeNull();
    const second = parseTelemetryLine(JSON.stringify(first));
    expect(second).toEqual(first);
  });
});
