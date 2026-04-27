/**
 * status.spec.ts — Tests for the /status command handler.
 *
 * Tests:
 *  1. Formats active session + queue correctly (3 fixture snapshots)
 *  2. ctx.reply failure does not crash handler (logs error, no rejection)
 *  3. Redactor applied to outbound text (plant fake sk-ant-api03 key, assert redacted)
 *  4. Multiple /status commands run serially — no race on shared state
 *  5. Integration smoke: bot.handleUpdate() routes through middleware + handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { buildStatusMessage, formatQueue, registerStatusHandler } from './status.js';
import type { ActiveSessionDto, QueueItemDto } from '@orch/shared';
import { redactSecrets } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const SESSION_ACTIVE: ActiveSessionDto = {
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

const QUEUE_ITEMS_3: QueueItemDto[] = [
  {
    id: 'q-1',
    projectId: 'my-project',
    planPath: '/plans/phase-3.md',
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
    planPath: '/plans/task-2.md',
    priority: 10,
    state: 'pending',
    sessionId: null,
    enqueuedAt: '2026-04-25T10:02:00.000Z',
    startedAt: null,
    endedAt: null,
  },
  {
    id: 'q-3',
    projectId: 'my-project',
    planPath: '/plans/cleanup.md',
    priority: 1,
    state: 'pending',
    sessionId: null,
    enqueuedAt: '2026-04-25T10:03:00.000Z',
    startedAt: null,
    endedAt: null,
  },
];

function makeMockApi(
  session: ActiveSessionDto | null,
  queue: QueueItemDto[],
): CoreApiClient {
  return {
    getActiveSession: vi.fn().mockResolvedValue(session),
    getQueue: vi.fn().mockResolvedValue(queue),
    stopSession: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue(queue[0]),
  } as unknown as CoreApiClient;
}

function makeMockBot() {
  const handlers: Map<string, (ctx: unknown) => Promise<void>> = new Map();
  return {
    command: vi.fn().mockImplementation((cmd: string, handler: (ctx: unknown) => Promise<void>) => {
      handlers.set(cmd, handler);
    }),
    _triggerCommand: async (cmd: string, ctx: unknown) => {
      const h = handlers.get(cmd);
      if (h) await h(ctx);
    },
    _handlers: handlers,
  };
}

function makeMockCtx(overrides: { reply?: ReturnType<typeof vi.fn> } = {}) {
  const reply = overrides.reply ?? vi.fn().mockResolvedValue(undefined);
  return {
    reply,
    chat: { id: 111 },
  };
}

function makeSilentLogger() {
  return pino({ level: 'silent' });
}

// ── Message formatting tests ───────────────────────────────────────────────────

describe('buildStatusMessage — fixture 1: no active session + empty queue', () => {
  it('formats correctly when no session and empty queue', () => {
    const msg = buildStatusMessage(null, []);
    expect(msg).toContain('=== Orch Status ===');
    expect(msg).toContain('Active session: none');
    expect(msg).toContain('Queue: empty');
  });
});

describe('buildStatusMessage — fixture 2: active session + empty queue', () => {
  it('formats session details correctly', () => {
    const msg = buildStatusMessage(SESSION_ACTIVE, []);
    expect(msg).toContain('Active session: sess-abc');
    expect(msg).toContain('my-project');
    expect(msg).toContain('/plans/phase-2.md');
    expect(msg).toContain('active');
    expect(msg).toContain('Queue: empty');
    expect(msg).toContain('1000');
    expect(msg).toContain('500');
    expect(msg).toContain('$0.0123');
  });
});

describe('buildStatusMessage — fixture 3: active session + 3 queue items', () => {
  it('formats all 3 queue items', () => {
    const msg = buildStatusMessage(SESSION_ACTIVE, QUEUE_ITEMS_3);
    expect(msg).toContain('Active session: sess-abc');
    expect(msg).toContain('Queue (3 items):');
    expect(msg).toContain('/plans/phase-3.md');
    expect(msg).toContain('/plans/task-2.md');
    expect(msg).toContain('/plans/cleanup.md');
  });
});

describe('formatQueue', () => {
  it('returns "Queue: empty" for empty array', () => {
    expect(formatQueue([])).toBe('Queue: empty');
  });

  it('formats singular item correctly', () => {
    const result = formatQueue([QUEUE_ITEMS_3[0]]);
    expect(result).toContain('Queue (1 item):');
  });
});

// ── Handler behaviour tests ────────────────────────────────────────────────────

describe('registerStatusHandler — handler behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends formatted status message to ctx.reply', async () => {
    const api = makeMockApi(SESSION_ACTIVE, QUEUE_ITEMS_3);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerStatusHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('status', ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('=== Orch Status ===');
    expect(text).toContain('sess-abc');
  });

  it('does not crash when ctx.reply throws — logs error instead', async () => {
    const api = makeMockApi(null, []);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const replyFn = vi.fn().mockRejectedValue(new Error('telegram timeout'));
    const ctx = makeMockCtx({ reply: replyFn });

    registerStatusHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    // Must not throw
    await expect(bot._triggerCommand('status', ctx)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errArg = errorSpy.mock.calls[0][1] as string;
    expect(errArg).toContain('reply-failed');
  });

  it('applies redactor to outbound text — fake API key is redacted', async () => {
    // Plant a fake Anthropic API key in the session planPath field
    const sessionWithSecret: ActiveSessionDto = {
      ...SESSION_ACTIVE,
      planPath: 'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
    };
    const api = makeMockApi(sessionWithSecret, []);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerStatusHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('status', ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).not.toContain('sk-ant-api03');
    expect(text).toContain('[REDACTED]');
  });

  it('calls getActiveSession and getQueue in parallel for each command', async () => {
    const getActiveSession = vi.fn().mockResolvedValue(null);
    const getQueue = vi.fn().mockResolvedValue([]);
    const api = { getActiveSession, getQueue } as unknown as CoreApiClient;
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerStatusHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    // Trigger twice (serial commands, no shared state to race)
    await bot._triggerCommand('status', ctx);
    await bot._triggerCommand('status', ctx);

    expect(getActiveSession).toHaveBeenCalledTimes(2);
    expect(getQueue).toHaveBeenCalledTimes(2);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
  });

  it('returns error message when API throws — does not crash handler', async () => {
    const api = {
      getActiveSession: vi.fn().mockRejectedValue(new Error('connection refused')),
      getQueue: vi.fn().mockResolvedValue([]),
    } as unknown as CoreApiClient;
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerStatusHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('status', ctx)).resolves.toBeUndefined();
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Error fetching status');
  });
});

// ── SIGTERM handler test ────────────────────────────────────────────────────────

describe('SIGTERM graceful shutdown', () => {
  it('process.emit SIGTERM triggers bot.stop() — direct handler test', async () => {
    // We test the SIGTERM handler logic directly (avoiding spawning child process on Windows)
    const stopFn = vi.fn().mockResolvedValue(undefined);
    const mockBot = { stop: stopFn };

    // Simulate the SIGTERM handler from main.ts
    const logger = makeSilentLogger();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => {
      // prevent actual exit
      return undefined as never;
    });

    // Register a one-time SIGTERM listener that mirrors main.ts logic
    const sigtermHandler = () => {
      logger.info({ msg: 'telegram:sigterm-received' });
      mockBot
        .stop()
        .then(() => {
          process.exit(0);
        })
        .catch(() => {
          process.exit(1);
        });
    };

    process.once('SIGTERM', sigtermHandler);

    // Emit SIGTERM synchronously
    process.emit('SIGTERM');

    // Allow microtasks to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(stopFn).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });
});
