/**
 * logs.spec.ts — Tests for the /logs command handler.
 *
 * Tests:
 *  1. Happy path (short): API returns ≤4096 chars → ctx.reply called (inline)
 *  2. Happy path (long): API returns >4096 chars → ctx.replyWithDocument called
 *  3. Error path: API throws → polite error message + logger.error
 *  4. No session-id arg → usage hint
 *  5. Redactor applied: plant fake secret in logs → redacted in reply
 *  6. ctx.reply failure → logged, does not throw (H-1)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { registerLogsHandler } from './logs.js';
import { redactSecrets } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeMockApi(logs: string): CoreApiClient {
  return {
    getLogs: vi.fn().mockResolvedValue(logs),
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
  text = '/logs sess-abc',
  overrides: {
    reply?: ReturnType<typeof vi.fn>;
    replyWithDocument?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const reply = overrides.reply ?? vi.fn().mockResolvedValue(undefined);
  const replyWithDocument = overrides.replyWithDocument ?? vi.fn().mockResolvedValue(undefined);
  return {
    reply,
    replyWithDocument,
    chat: { id: 111 },
    message: { text },
  };
}

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('registerLogsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path ≤4096 chars: sends logs inline via ctx.reply', async () => {
    const shortLog = 'line1\nline2\nline3';
    const api = makeMockApi(shortLog);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx('/logs sess-abc');

    registerLogsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('logs', ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.replyWithDocument).not.toHaveBeenCalled();
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('line1');
    expect(text).toContain('line3');
  });

  it('happy path >4096 chars: sends logs as .txt file via ctx.replyWithDocument', async () => {
    // Generate a string longer than 4096 chars
    const longLog = 'x'.repeat(5000);
    const api = makeMockApi(longLog);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx('/logs sess-abc');

    registerLogsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('logs', ctx);

    expect(ctx.replyWithDocument).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
    // Verify caption contains session-id
    const callArgs = ctx.replyWithDocument.mock.calls[0];
    const caption = (callArgs[1] as { caption?: string })?.caption ?? '';
    expect(caption).toContain('sess-abc');
  });

  it('error path: API throws → polite error message + logger.error', async () => {
    const api = {
      getLogs: vi.fn().mockRejectedValue(new Error('404 Not Found')),
    } as unknown as CoreApiClient;
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const ctx = makeMockCtx('/logs sess-abc');

    registerLogsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('logs', ctx)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Error fetching logs');
    expect(text).toContain('sess-abc');
  });

  it('no session-id argument → sends usage hint', async () => {
    const api = makeMockApi('');
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx('/logs');

    registerLogsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('logs', ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('/logs <session-id>');
  });

  it('redactor applied: fake secret in logs → redacted in reply', async () => {
    const logsWithSecret = 'Found token sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv in config';
    const api = makeMockApi(logsWithSecret);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx('/logs sess-abc');

    registerLogsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('logs', ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).not.toContain('sk-ant-api03');
    expect(text).toContain('[REDACTED]');
  });

  it('ctx.reply failure is logged and does not throw (H-1)', async () => {
    const api = makeMockApi('short log');
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const replyFn = vi.fn().mockRejectedValue(new Error('telegram network error'));
    const ctx = makeMockCtx('/logs sess-abc', { reply: replyFn });

    registerLogsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('logs', ctx)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
