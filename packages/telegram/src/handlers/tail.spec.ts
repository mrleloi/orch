/**
 * tail.spec.ts — Tests for the /tail command handler.
 *
 * Tests:
 *  1. Happy path: active session + tail data → reply contains tail lines
 *  2. Error path: API throws → polite error message + logger.error
 *  3. No-data path: no active session → "No session running."
 *  4. Redactor applied: plant fake secret in tail line → redacted in reply
 *  5. parseTailArg: clamps to max 100 (client-side)
 *  6. parseTailArg: defaults to 20 when no arg given
 *  7. parseTailArg: handles invalid arg → defaults
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { parseTailArg, registerTailHandler } from './tail.js';
import type { ActiveSessionDto, TailResponseDto } from '@orch/shared';
import { redactSecrets } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ACTIVE_SESSION: ActiveSessionDto = {
  id: 'sess-abc',
  projectId: 'my-project',
  planPath: '/plans/phase-2.md',
  state: 'active',
  claudeSessionId: null,
  startedAt: '2026-04-25T10:00:00.000Z',
  endedAt: null,
  inputTokens: 1000,
  outputTokens: 500,
  costUsd: 0.0123,
  traceId: null,
  createdAt: '2026-04-25T09:59:00.000Z',
  updatedAt: '2026-04-25T10:00:00.000Z',
};

const TAIL_RESPONSE: TailResponseDto = {
  lines: [
    '{"type":"text","text":"Running task 1..."}',
    '{"type":"text","text":"Running task 2..."}',
    '{"type":"text","text":"Done."}',
  ],
  truncated: false,
};

function makeMockApi(
  session: ActiveSessionDto | null,
  tail: TailResponseDto,
): CoreApiClient {
  return {
    getActiveSession: vi.fn().mockResolvedValue(session),
    getTail: vi.fn().mockResolvedValue(tail),
  } as unknown as CoreApiClient;
}

function makeMockBot() {
  const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
  return {
    command: vi.fn().mockImplementation((cmd: string, handler: (ctx: unknown) => Promise<void>) => {
      handlers.set(cmd, handler);
    }),
    _triggerCommand: async (cmd: string, ctx: unknown) => {
      const h = handlers.get(cmd);
      if (h) await h(ctx);
    },
  };
}

function makeMockCtx(
  text = '/tail',
  overrides: { reply?: ReturnType<typeof vi.fn> } = {},
) {
  const reply = overrides.reply ?? vi.fn().mockResolvedValue(undefined);
  return {
    reply,
    chat: { id: 111 },
    message: { text },
  };
}

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

// ── parseTailArg tests ─────────────────────────────────────────────────────────

describe('parseTailArg', () => {
  it('defaults to 20 when no argument given', () => {
    expect(parseTailArg(undefined)).toBe(20);
  });

  it('defaults to 20 when empty string given', () => {
    expect(parseTailArg('')).toBe(20);
  });

  it('parses valid number', () => {
    expect(parseTailArg('50')).toBe(50);
  });

  it('clamps to max 100 (client-side)', () => {
    expect(parseTailArg('999')).toBe(100);
    expect(parseTailArg('200')).toBe(100);
  });

  it('defaults to 20 for invalid input', () => {
    expect(parseTailArg('abc')).toBe(20);
    expect(parseTailArg('-5')).toBe(20);
    expect(parseTailArg('0')).toBe(20);
  });
});

// ── Handler tests ──────────────────────────────────────────────────────────────

describe('registerTailHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: active session + tail data → reply contains tail lines', async () => {
    const api = makeMockApi(ACTIVE_SESSION, TAIL_RESPONSE);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx('/tail 3');

    registerTailHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('tail', ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('sess-abc');
    expect(text).toContain('Running task 1');
    expect(text).toContain('Done.');
  });

  it('error path: API throws → polite error message + logger.error', async () => {
    const api = {
      getActiveSession: vi.fn().mockRejectedValue(new Error('connection refused')),
      getTail: vi.fn(),
    } as unknown as CoreApiClient;
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const ctx = makeMockCtx('/tail');

    registerTailHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('tail', ctx)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Error fetching tail');
  });

  it('no-session path: no active session → polite "No session running."', async () => {
    const api = makeMockApi(null, TAIL_RESPONSE);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx('/tail');

    registerTailHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('tail', ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toBe('No session running.');
  });

  it('redactor applied: fake secret in tail line → redacted in reply', async () => {
    const tailWithSecret: TailResponseDto = {
      lines: ['{"type":"text","text":"token sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv found"}'],
      truncated: false,
    };
    const api = makeMockApi(ACTIVE_SESSION, tailWithSecret);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx('/tail');

    registerTailHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('tail', ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).not.toContain('sk-ant-api03');
    expect(text).toContain('[REDACTED]');
  });

  it('ctx.reply failure is logged and does not throw (H-1)', async () => {
    const api = makeMockApi(null, TAIL_RESPONSE);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const replyFn = vi.fn().mockRejectedValue(new Error('telegram timeout'));
    const ctx = makeMockCtx('/tail', { reply: replyFn });

    registerTailHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('tail', ctx)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errArg = errorSpy.mock.calls[0][1] as string;
    expect(errArg).toContain('reply-failed');
  });
});
