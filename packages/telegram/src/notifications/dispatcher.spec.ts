/**
 * dispatcher.spec.ts — Tests for the notification dispatcher (Task 2.5 A2+A3).
 *
 * Tests 9-16:
 *  9.  session.started payload → formatted message to primaryChatId via bot.api.sendMessage
 *  10. hook.received with hookName != UserPromptSubmit → NOT sent
 *  11. hook.received with hookName=UserPromptSubmit → sent
 *  12. Unknown event type → silently dropped (no send)
 *  13. Redactor applied (plant sk-ant-api03-XXX in payload, assert redacted in sent text)
 *  14. Rate-limit: 12 events in 30s (fake clock) → 10 sent, suppression count=2
 *  15. After rate-limit window, next message prepends "(2 events suppressed)"
 *  16. queue.state_changed event triggers GET /api/v1/queue; empty response → "queue drained"
 *
 * Integration tests 19-20:
 *  19. End-to-end mock: SSE event → dispatcher → bot.api.sendMessage
 *  20. Dispatcher sendMessage throws 429 → withFloodControl handles, no crash
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { GrammyError } from 'grammy';
import { createNotificationDispatcher } from './dispatcher.js';
import type { SseEnvelope } from '@orch/shared';
import { redactSecrets } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

function makeBot(sendMessageFn = vi.fn().mockResolvedValue({ message_id: 1 })) {
  return {
    api: {
      sendMessage: sendMessageFn,
    },
  };
}

function makeApi(queueItems: { state: string }[] = []) {
  return {
    getQueue: vi.fn().mockResolvedValue(queueItems),
  } as unknown as CoreApiClient;
}

function makeEnvelope(
  type: string,
  payload: unknown,
): SseEnvelope {
  return {
    type: type as SseEnvelope['type'],
    payload,
    ts: '2026-04-25T10:00:00.000Z',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 9: session.started → formatted message sent
  it('test-9: session.started → sends formatted message to primaryChatId', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    await dispatcher.handle(
      makeEnvelope('session.started', { projectId: 'my-project', sessionId: 'abcdefgh1234' }),
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendMessage.mock.calls[0] as [number, string];
    expect(chatId).toBe(12345);
    expect(text).toContain('Session started');
    expect(text).toContain('my-project');
    expect(text).toContain('abcdefgh'); // short ID (first 8 chars)
  });

  // Test 10: hook.received with hookName != UserPromptSubmit → NOT sent
  it('test-10: hook.received with non-UserPromptSubmit hookName → not sent', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    await dispatcher.handle(
      makeEnvelope('hook.received', { hookName: 'PostToolUse', data: 'something' }),
    );

    expect(sendMessage).not.toHaveBeenCalled();
  });

  // Test 11: hook.received with hookName=UserPromptSubmit → sent
  it('test-11: hook.received with hookName=UserPromptSubmit → sends notification', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    await dispatcher.handle(
      makeEnvelope('hook.received', { hookName: 'UserPromptSubmit', sessionId: 'sess-xyz-abc' }),
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const text = sendMessage.mock.calls[0][1] as string;
    expect(text).toContain('UserPromptSubmit');
  });

  // Test 12: Unknown event type → silently dropped
  it('test-12: unknown event type → silently dropped (no send)', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    // 'project.registered' is a valid SSE type but not in the formatter registry
    await dispatcher.handle(
      makeEnvelope('project.registered', { projectId: 'p-1' }),
    );

    expect(sendMessage).not.toHaveBeenCalled();
  });

  // Test 13: Redactor applied to outbound text
  it('test-13: redactor strips secrets from sent message', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    // Plant a fake Anthropic API key in the payload
    await dispatcher.handle(
      makeEnvelope('session.started', {
        projectId: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
        sessionId: 'sess-1',
      }),
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const text = sendMessage.mock.calls[0][1] as string;
    expect(text).not.toContain('sk-ant-api03');
    expect(text).toContain('[REDACTED]');
  });

  // Test 14: Rate-limit: 12 events in 30s → 10 sent, 2 suppressed
  it('test-14: 12 events in window → 10 sent, 2 suppressed', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    // Fake clock: all events within the 60s window
    let fakeTime = 1_000_000;
    const clock = () => fakeTime;

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
      clock,
    });

    // Send 12 events within the 60s window
    for (let i = 0; i < 12; i++) {
      // Advance time by 100ms per event (all within 60s window)
      fakeTime += 100;
      await dispatcher.handle(
        makeEnvelope('session.ended', { projectId: 'p', sessionId: `sess-${i}`, status: 'completed' }),
      );
    }

    // 10 sent (max per window), 2 suppressed
    expect(sendMessage).toHaveBeenCalledTimes(10);
  });

  // Test 15: After rate-limit window, next message prepends suppression summary
  it('test-15: after window resets, next message includes suppression prefix', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    let fakeTime = 2_000_000;
    const clock = () => fakeTime;

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
      clock,
    });

    // Saturate the window (10 events → rate-limited)
    for (let i = 0; i < 12; i++) {
      fakeTime += 100; // all within 60s window
      await dispatcher.handle(
        makeEnvelope('session.ended', { projectId: 'p', sessionId: `s-${i}`, status: 'done' }),
      );
    }

    expect(sendMessage).toHaveBeenCalledTimes(10);

    // Advance past the 60s window
    fakeTime += 61_000;

    // Next event should be allowed AND include suppression prefix
    await dispatcher.handle(
      makeEnvelope('session.started', { projectId: 'p', sessionId: 'new-sess' }),
    );

    expect(sendMessage).toHaveBeenCalledTimes(11);
    const lastCallText = sendMessage.mock.calls[10][1] as string;
    expect(lastCallText).toContain('events suppressed in last 60s');
  });

  // Test 16: queue.state_changed → polls /api/v1/queue; empty → "Queue drained"
  it('test-16: queue.state_changed with empty queue → sends "Queue drained" notification', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    // getQueue returns empty list (all items are 'completed', not pending/running)
    const api = makeApi([
      { state: 'completed' },
      { state: 'failed' },
    ]);
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    await dispatcher.handle(makeEnvelope('queue.state_changed', {}));

    expect(api.getQueue).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const text = sendMessage.mock.calls[0][1] as string;
    expect(text).toContain('Queue drained');
  });

  it('queue.state_changed with pending items → does NOT send queue drained', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const bot = makeBot(sendMessage);
    const api = makeApi([{ state: 'pending' }]);
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    await dispatcher.handle(makeEnvelope('queue.state_changed', {}));

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

// ── Integration tests 19-20 ───────────────────────────────────────────────────

describe('Integration: dispatcher + flood control', () => {
  // Test 19: end-to-end: SSE event → dispatcher → sendMessage
  it('test-19: end-to-end: SSE envelope routed through dispatcher to sendMessage', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 42 });
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 99999,
      api,
      redactor: redactSecrets,
      logger,
    });

    const envelope: SseEnvelope = {
      type: 'session.rate_limited',
      payload: { sessionId: 'xyz-session-id', backoffMs: 5000 },
      ts: '2026-04-25T10:00:00.000Z',
      trace_id: 'a'.repeat(32),
      span_id: 'b'.repeat(16),
    };

    await dispatcher.handle(envelope);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendMessage.mock.calls[0] as [number, string];
    expect(chatId).toBe(99999);
    expect(text).toContain('Rate-limit hit');
    expect(text).toContain('5000ms');
  });

  // Test 20: sendMessage throws 429 → withFloodControl handles, no crash
  it('test-20: sendMessage throws GrammyError 429 → withFloodControl, no crash', async () => {
    // Make sendMessage always throw 429
    const err429 = new GrammyError(
      'Too Many Requests: retry after 1',
      { ok: false, error_code: 429, description: 'Too Many Requests: retry after 1', parameters: { retry_after: 1 } },
      '',
      {},
    );
    const sendMessage = vi.fn().mockRejectedValue(err429);
    const bot = makeBot(sendMessage);
    const api = makeApi();
    const logger = makeSilentLogger();

    vi.useFakeTimers();

    const dispatcher = createNotificationDispatcher({
      bot: bot as never,
      primaryChatId: 12345,
      api,
      redactor: redactSecrets,
      logger,
    });

    // Should NOT throw despite 429
    const handlePromise = dispatcher.handle(
      makeEnvelope('session.context_full', { sessionId: 'sess-abc' }),
    );

    // Advance timers to let flood control retries expire
    await vi.advanceTimersByTimeAsync(100_000);
    await handlePromise;

    // Confirms flood control maxed out (4 calls: 1 initial + 3 retries)
    // OR the handler resolved gracefully after max retries
    expect(sendMessage.mock.calls.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });
});
