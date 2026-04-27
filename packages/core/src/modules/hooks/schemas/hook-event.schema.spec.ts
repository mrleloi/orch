/**
 * hook-event.schema.spec.ts
 *
 * Unit tests for zod schemas and isValidHookEventType helper.
 *
 * I-10: All external inputs must pass zod validation.
 * Covers:
 *  - All 11 event type schemas parse valid payloads (including SessionStart)
 *  - Extra fields are stripped (not rejected)
 *  - Missing required fields fail validation
 *  - isValidHookEventType guards correctly
 */

import {
  HOOK_SCHEMAS,
  isValidHookEventType,
  SessionStartSchema,
  PreToolUseSchema,
  PostToolUseSchema,
  UserPromptSubmitSchema,
  NotificationSchema,
  StopSchema,
  SessionEndSchema,
  SubagentStopSchema,
  PreCompactSchema,
  PostCompactSchema,
  ApiErrorSchema,
} from './hook-event.schema.js';

const VALID_SESSION_ID = 'session-uuid-123';

// ── isValidHookEventType ──────────────────────────────────────────────────────

describe('isValidHookEventType', () => {
  it('returns true for all valid event types', () => {
    const validTypes = Object.keys(HOOK_SCHEMAS);
    for (const type of validTypes) {
      expect(isValidHookEventType(type)).toBe(true);
    }
  });

  it('returns false for unknown event types', () => {
    expect(isValidHookEventType('Unknown')).toBe(false);
    expect(isValidHookEventType('')).toBe(false);
    expect(isValidHookEventType('preToolUse')).toBe(false); // wrong case
    expect(isValidHookEventType('sessionStart')).toBe(false); // wrong case
  });
});

// ── SessionStartSchema ────────────────────────────────────────────────────────

describe('SessionStartSchema', () => {
  it('parses minimal valid payload (session_id only)', () => {
    const result = SessionStartSchema.safeParse({ session_id: VALID_SESSION_ID });
    expect(result.success).toBe(true);
  });

  it('parses full payload with all optional fields', () => {
    const result = SessionStartSchema.safeParse({
      session_id: VALID_SESSION_ID,
      claude_session_id: 'claude-uuid-abc',
      model: 'claude-opus-4-5',
      source: 'startup',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claude_session_id).toBe('claude-uuid-abc');
      expect(result.data.model).toBe('claude-opus-4-5');
      expect(result.data.source).toBe('startup');
    }
  });

  it('accepts all valid source values', () => {
    for (const source of ['startup', 'resume', 'clear', 'compact'] as const) {
      const result = SessionStartSchema.safeParse({
        session_id: VALID_SESSION_ID,
        source,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown source value', () => {
    const result = SessionStartSchema.safeParse({
      session_id: VALID_SESSION_ID,
      source: 'unknown-source',
    });
    expect(result.success).toBe(false);
  });

  it('fails without session_id', () => {
    const result = SessionStartSchema.safeParse({ model: 'claude-opus-4-5' });
    expect(result.success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = SessionStartSchema.safeParse({
      session_id: VALID_SESSION_ID,
      extra_field: 'should be stripped',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('extra_field' in result.data).toBe(false);
    }
  });
});

// ── PreToolUseSchema ──────────────────────────────────────────────────────────

describe('PreToolUseSchema', () => {
  it('parses a minimal valid payload', () => {
    const result = PreToolUseSchema.safeParse({
      session_id: VALID_SESSION_ID,
      tool_name: 'Bash',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool_name).toBe('Bash');
      expect(result.data.is_agent).toBe(false); // default
    }
  });

  it('parses a full payload with optional fields', () => {
    const result = PreToolUseSchema.safeParse({
      session_id: VALID_SESSION_ID,
      tool_name: 'Agent',
      is_agent: true,
      tool_input: { prompt: 'do something' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_agent).toBe(true);
    }
  });

  it('strips unknown fields', () => {
    const result = PreToolUseSchema.safeParse({
      session_id: VALID_SESSION_ID,
      tool_name: 'Read',
      unknown_field: 'should be stripped',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('unknown_field' in result.data).toBe(false);
    }
  });

  it('fails when session_id is missing', () => {
    const result = PreToolUseSchema.safeParse({ tool_name: 'Bash' });
    expect(result.success).toBe(false);
  });

  it('fails when tool_name is missing', () => {
    const result = PreToolUseSchema.safeParse({ session_id: VALID_SESSION_ID });
    expect(result.success).toBe(false);
  });
});

// ── PostToolUseSchema ─────────────────────────────────────────────────────────

describe('PostToolUseSchema', () => {
  it('parses valid payload', () => {
    const result = PostToolUseSchema.safeParse({
      session_id: VALID_SESSION_ID,
      tool_name: 'Write',
    });
    expect(result.success).toBe(true);
  });

  it('fails without session_id', () => {
    const result = PostToolUseSchema.safeParse({ tool_name: 'Write' });
    expect(result.success).toBe(false);
  });
});

// ── UserPromptSubmitSchema ────────────────────────────────────────────────────

describe('UserPromptSubmitSchema', () => {
  it('parses valid payload', () => {
    const result = UserPromptSubmitSchema.safeParse({
      session_id: VALID_SESSION_ID,
      prompt: 'implement feature X',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe('implement feature X');
    }
  });

  it('fails without prompt', () => {
    const result = UserPromptSubmitSchema.safeParse({
      session_id: VALID_SESSION_ID,
    });
    expect(result.success).toBe(false);
  });
});

// ── NotificationSchema ────────────────────────────────────────────────────────

describe('NotificationSchema', () => {
  it('parses valid payload without metadata', () => {
    const result = NotificationSchema.safeParse({
      session_id: VALID_SESSION_ID,
      message: 'Context compacted',
    });
    expect(result.success).toBe(true);
  });

  it('parses payload with metadata', () => {
    const result = NotificationSchema.safeParse({
      session_id: VALID_SESSION_ID,
      message: 'test',
      metadata: { key: 'value', count: 42 },
    });
    expect(result.success).toBe(true);
  });

  it('fails without message', () => {
    const result = NotificationSchema.safeParse({
      session_id: VALID_SESSION_ID,
    });
    expect(result.success).toBe(false);
  });
});

// ── StopSchema ────────────────────────────────────────────────────────────────

describe('StopSchema', () => {
  it('parses valid payload with defaults', () => {
    const result = StopSchema.safeParse({ session_id: VALID_SESSION_ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_error).toBe(false); // default
    }
  });

  it('parses error stop', () => {
    const result = StopSchema.safeParse({
      session_id: VALID_SESSION_ID,
      is_error: true,
      stop_reason: 'timeout',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_error).toBe(true);
    }
  });
});

// ── SessionEndSchema ──────────────────────────────────────────────────────────

describe('SessionEndSchema', () => {
  it('parses minimal payload', () => {
    const result = SessionEndSchema.safeParse({ session_id: VALID_SESSION_ID });
    expect(result.success).toBe(true);
  });

  it('parses payload with end_reason', () => {
    const result = SessionEndSchema.safeParse({
      session_id: VALID_SESSION_ID,
      end_reason: 'user_exit',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.end_reason).toBe('user_exit');
    }
  });
});

// ── SubagentStopSchema ────────────────────────────────────────────────────────

describe('SubagentStopSchema', () => {
  it('parses valid payload', () => {
    const result = SubagentStopSchema.safeParse({
      session_id: VALID_SESSION_ID,
      subagent_id: 'subagent-uuid-456',
    });
    expect(result.success).toBe(true);
  });

  it('fails without subagent_id', () => {
    const result = SubagentStopSchema.safeParse({ session_id: VALID_SESSION_ID });
    expect(result.success).toBe(false);
  });
});

// ── PreCompactSchema ──────────────────────────────────────────────────────────

describe('PreCompactSchema', () => {
  it('parses valid payload', () => {
    const result = PreCompactSchema.safeParse({
      session_id: VALID_SESSION_ID,
      compact_uuid: 'compact-uuid-789',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compact_uuid).toBe('compact-uuid-789');
    }
  });

  it('fails without compact_uuid', () => {
    const result = PreCompactSchema.safeParse({ session_id: VALID_SESSION_ID });
    expect(result.success).toBe(false);
  });
});

// ── PostCompactSchema ─────────────────────────────────────────────────────────

describe('PostCompactSchema', () => {
  it('parses valid payload', () => {
    const result = PostCompactSchema.safeParse({
      session_id: VALID_SESSION_ID,
      compact_uuid: 'compact-uuid-789',
    });
    expect(result.success).toBe(true);
  });
});

// ── ApiErrorSchema ────────────────────────────────────────────────────────────

describe('ApiErrorSchema', () => {
  it('parses valid payload', () => {
    const result = ApiErrorSchema.safeParse({
      session_id: VALID_SESSION_ID,
      error_type: 'overloaded_error',
      error_message: 'The API is temporarily overloaded',
    });
    expect(result.success).toBe(true);
  });

  it('parses payload with retry_after_secs', () => {
    const result = ApiErrorSchema.safeParse({
      session_id: VALID_SESSION_ID,
      error_type: 'rate_limit_error',
      error_message: 'Rate limited',
      retry_after_secs: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.retry_after_secs).toBe(30);
    }
  });

  it('fails without error_type', () => {
    const result = ApiErrorSchema.safeParse({
      session_id: VALID_SESSION_ID,
      error_message: 'some error',
    });
    expect(result.success).toBe(false);
  });

  it('fails without error_message', () => {
    const result = ApiErrorSchema.safeParse({
      session_id: VALID_SESSION_ID,
      error_type: 'overloaded_error',
    });
    expect(result.success).toBe(false);
  });
});
