/**
 * whitelist.middleware.spec.ts — Tests for the Grammy whitelist middleware.
 *
 * Tests:
 *  1. Allows update from a known (whitelisted) chat ID
 *  2. Denies update from unknown chat ID with polite refusal message
 *  3. Logs denial at warn level for unknown chat ID
 *  4. Handles missing ctx.chat (no chatId) as denial
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context, MiddlewareFn } from 'grammy';
import pino from 'pino';
import { whitelistMiddleware } from './whitelist.middleware.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeMockCtx(chatId: number | undefined): {
  ctx: Partial<Context> & { reply: ReturnType<typeof vi.fn> };
  reply: ReturnType<typeof vi.fn>;
} {
  const reply = vi.fn().mockResolvedValue(undefined);
  const ctx: Partial<Context> & { reply: ReturnType<typeof vi.fn> } = {
    chat: chatId !== undefined ? { id: chatId, type: 'private' } : undefined,
    reply,
  };
  return { ctx, reply };
}

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('whitelistMiddleware', () => {
  const allowedIds = new Set([111, 222, 333]);
  let middleware: MiddlewareFn<Context>;
  let logger: ReturnType<typeof pino>;

  beforeEach(() => {
    logger = makeSilentLogger();
    middleware = whitelistMiddleware(allowedIds, logger);
    vi.clearAllMocks();
  });

  it('calls next() for a known whitelisted chat ID', async () => {
    const { ctx } = makeMockCtx(111);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as unknown as Context, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('does NOT call next() for an unknown chat ID', async () => {
    const { ctx } = makeMockCtx(999);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as unknown as Context, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('sends a polite refusal reply for unknown chat ID', async () => {
    const { ctx, reply } = makeMockCtx(999);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as unknown as Context, next);

    expect(reply).toHaveBeenCalledTimes(1);
    const replyText = reply.mock.calls[0][0] as string;
    expect(replyText).toContain('not authorised');
  });

  it('logs denial at warn level for unknown chat ID', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const { ctx } = makeMockCtx(999);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as unknown as Context, next);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = warnSpy.mock.calls[0][0] as { msg: string; chatId: number | string };
    expect(warnArg.msg).toBe('telegram:whitelist:denied');
    expect(warnArg.chatId).toBe(999);
  });

  it('logs denial at warn level when ctx.chat is missing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const { ctx } = makeMockCtx(undefined);
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(ctx as unknown as Context, next);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArg = warnSpy.mock.calls[0][0] as { msg: string; chatId: number | string };
    expect(warnArg.chatId).toBe('unknown');
  });

  it('does not throw when ctx.reply fails for unknown chat ID', async () => {
    const { ctx } = makeMockCtx(999);
    ctx.reply = vi.fn().mockRejectedValue(new Error('network error'));
    const errorSpy = vi.spyOn(logger, 'error');
    const next = vi.fn().mockResolvedValue(undefined);

    // Must not throw
    await expect(middleware(ctx as unknown as Context, next)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
