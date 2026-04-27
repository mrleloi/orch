/**
 * queue.spec.ts — Tests for the /queue command handler.
 *
 * Tests:
 *  1. Happy path: API returns items → formatted reply contains expected fields
 *  2. Error path: API throws → polite error message + logger.error
 *  3. No-data path: empty queue → "Queue: empty"
 *  4. Redactor applied: plant fake secret in DTO → redacted in reply
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { formatQueueItems, registerQueueHandler } from './queue.js';
import type { QueueItemDto } from '@orch/shared';
import { redactSecrets } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const QUEUE_ITEMS: QueueItemDto[] = [
  {
    id: 'q-1',
    projectId: 'my-project',
    planPath: '/plans/session-plans/pending/phase-2.md',
    priority: 50,
    state: 'pending',
    sessionId: null,
    enqueuedAt: '2026-04-25T10:01:00.000Z',
    startedAt: null,
    endedAt: null,
  },
  {
    id: 'q-2',
    projectId: 'other-project',
    planPath: '/plans/task-3.md',
    priority: 10,
    state: 'running',
    sessionId: 'sess-abc',
    enqueuedAt: '2026-04-25T10:02:00.000Z',
    startedAt: '2026-04-25T10:02:30.000Z',
    endedAt: null,
  },
];

function makeMockApi(queue: QueueItemDto[]): CoreApiClient {
  return {
    getQueue: vi.fn().mockResolvedValue(queue),
    getActiveSession: vi.fn().mockResolvedValue(null),
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

function makeMockCtx(overrides: { reply?: ReturnType<typeof vi.fn> } = {}) {
  const reply = overrides.reply ?? vi.fn().mockResolvedValue(undefined);
  return { reply, chat: { id: 111 } };
}

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

// ── formatQueueItems tests ─────────────────────────────────────────────────────

describe('formatQueueItems', () => {
  it('returns "Queue: empty" for empty array', () => {
    expect(formatQueueItems([])).toBe('Queue: empty');
  });

  it('formats items with position, state, project, plan-file name', () => {
    const result = formatQueueItems(QUEUE_ITEMS);
    expect(result).toContain('Queue (2 items):');
    expect(result).toContain('1.');
    expect(result).toContain('[pending]');
    expect(result).toContain('my-project');
    expect(result).toContain('phase-2.md'); // basename only
    expect(result).toContain('2.');
    expect(result).toContain('[running]');
    expect(result).toContain('other-project');
    expect(result).toContain('task-3.md');
  });

  it('uses singular "item" for count of 1', () => {
    const result = formatQueueItems([QUEUE_ITEMS[0]]);
    expect(result).toContain('Queue (1 item):');
  });
});

// ── Handler tests ──────────────────────────────────────────────────────────────

describe('registerQueueHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: API returns items → reply contains expected fields', async () => {
    const api = makeMockApi(QUEUE_ITEMS);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerQueueHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('queue', ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Queue (2 items):');
    expect(text).toContain('my-project');
    expect(text).toContain('phase-2.md');
  });

  it('error path: API throws → polite error message + logger.error', async () => {
    const api = {
      getQueue: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as CoreApiClient;
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const ctx = makeMockCtx();

    registerQueueHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('queue', ctx)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Error fetching queue');
  });

  it('no-data path: empty queue → polite empty message', async () => {
    const api = makeMockApi([]);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerQueueHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('queue', ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toBe('Queue: empty');
  });

  it('redactor applied: fake API key in projectId is redacted in reply', async () => {
    const secretItem: QueueItemDto = {
      ...QUEUE_ITEMS[0],
      projectId: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
    };
    const api = makeMockApi([secretItem]);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerQueueHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('queue', ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).not.toContain('sk-ant-api03');
    expect(text).toContain('[REDACTED]');
  });

  it('ctx.reply failure is logged and does not throw (H-1)', async () => {
    const api = makeMockApi([]);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const replyFn = vi.fn().mockRejectedValue(new Error('telegram timeout'));
    const ctx = makeMockCtx({ reply: replyFn });

    registerQueueHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('queue', ctx)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errArg = errorSpy.mock.calls[0][1] as string;
    expect(errArg).toContain('reply-failed');
  });
});
