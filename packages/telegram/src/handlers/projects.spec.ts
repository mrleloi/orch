/**
 * projects.spec.ts — Tests for the /projects command handler.
 *
 * Tests:
 *  1. Happy path: API returns projects → formatted reply contains expected fields
 *  2. Error path: API throws → polite error message + logger.error
 *  3. No-data path: no projects → "Projects: none registered"
 *  4. Redactor applied: plant fake secret in DTO → redacted in reply
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { formatProjects, registerProjectsHandler } from './projects.js';
import type { ProjectDto } from '@orch/shared';
import { redactSecrets } from '@orch/shared';
import type { CoreApiClient } from '../api/core-client.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const PROJECTS: ProjectDto[] = [
  {
    projectId: 'my-project',
    rootPath: '/home/user/my-project',
    ccsProfile: 'default',
    maxConcurrentSessions: 1,
  },
  {
    projectId: 'other-project',
    rootPath: '/home/user/other-project',
    ccsProfile: 'premium',
    maxConcurrentSessions: 2,
  },
];

function makeMockApi(projects: ProjectDto[]): CoreApiClient {
  return {
    getProjects: vi.fn().mockResolvedValue(projects),
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

// ── formatProjects tests ───────────────────────────────────────────────────────

describe('formatProjects', () => {
  it('returns "Projects: none registered" for empty array', () => {
    expect(formatProjects([])).toBe('Projects: none registered');
  });

  it('formats projects with projectId, profile, and rootPath', () => {
    const result = formatProjects(PROJECTS);
    expect(result).toContain('Projects (2):');
    expect(result).toContain('my-project');
    expect(result).toContain('default');
    expect(result).toContain('/home/user/my-project');
    expect(result).toContain('other-project');
    expect(result).toContain('premium');
  });
});

// ── Handler tests ──────────────────────────────────────────────────────────────

describe('registerProjectsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: API returns projects → reply contains expected fields', async () => {
    const api = makeMockApi(PROJECTS);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerProjectsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('projects', ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Projects (2):');
    expect(text).toContain('my-project');
    expect(text).toContain('default');
  });

  it('error path: API throws → polite error message + logger.error', async () => {
    const api = {
      getProjects: vi.fn().mockRejectedValue(new Error('500 Internal Server Error')),
    } as unknown as CoreApiClient;
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const ctx = makeMockCtx();

    registerProjectsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('projects', ctx)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('Error fetching projects');
  });

  it('no-data path: no projects registered → polite empty message', async () => {
    const api = makeMockApi([]);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerProjectsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('projects', ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toBe('Projects: none registered');
  });

  it('redactor applied: fake API key in rootPath is redacted in reply', async () => {
    const secretProject: ProjectDto = {
      ...PROJECTS[0],
      rootPath: '/home/sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv/project',
    };
    const api = makeMockApi([secretProject]);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const ctx = makeMockCtx();

    registerProjectsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await bot._triggerCommand('projects', ctx);

    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).not.toContain('sk-ant-api03');
    expect(text).toContain('[REDACTED]');
  });

  it('ctx.reply failure is logged and does not throw (H-1)', async () => {
    const api = makeMockApi([]);
    const bot = makeMockBot();
    const logger = makeSilentLogger();
    const errorSpy = vi.spyOn(logger, 'error');
    const replyFn = vi.fn().mockRejectedValue(new Error('network error'));
    const ctx = makeMockCtx({ reply: replyFn });

    registerProjectsHandler(
      bot as unknown as import('grammy').Bot,
      api,
      redactSecrets,
      logger,
    );

    await expect(bot._triggerCommand('projects', ctx)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errArg = errorSpy.mock.calls[0][1] as string;
    expect(errArg).toContain('reply-failed');
  });
});
