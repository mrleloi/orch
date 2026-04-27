/**
 * session-usage.controller.spec.ts — Tests for GET /api/v1/sessions/:id/usage
 * and GET /api/v1/config endpoints.
 *
 * Tests (6 total):
 *  1. usage endpoint returns empty samples + zero totals when no spans observed
 *  2. usage endpoint returns aggregated samples from ContextBudgetService
 *  3. usage endpoint rejects bad query params with 400 (I-10 zod validation)
 *  4. config endpoint returns traceBackendUiUrl from env
 *  5. MODEL_PRICING table calculates cost correctly for known models
 *  6. calculateCostUsd returns 0 for unknown model
 *
 * Auth 401 gating is tested in bearer-auth.middleware.spec.ts and
 * api.controller.spec.ts (existing coverage). Not duplicated here.
 */

import { BadRequestException, Logger } from '@nestjs/common';
import { ApiController } from './api.controller.js';
import { DomainError } from '../../domain/errors.js';
import { ContextBudgetService } from '../context-budget/context-budget.service.js';
import type { SessionUsageResponse } from '../context-budget/context-budget.types.js';
import { calculateCostUsd, MODEL_PRICING } from '../../config/model-pricing.js';
import type { ProjectRegistryService } from '../project-registry/project-registry.service.js';
import type { QueueService } from '../queue/queue.service.js';
import type { QueueRepository } from '../queue/queue.repository.js';
import type { SessionManager } from '../sessions/session-manager.js';
import type { OperatorActionLogService } from '../audit/operator-action-log.service.js';

// ── Mock factories ─────────────────────────────────────────────────────────────

function makeMockContextBudget(
  usageOverride?: SessionUsageResponse | null,
): jest.Mocked<Pick<ContextBudgetService, 'getUsage'>> {
  return {
    getUsage: jest.fn().mockReturnValue(usageOverride ?? null),
  };
}

function buildController(
  contextBudget?: jest.Mocked<Pick<ContextBudgetService, 'getUsage'>>,
): ApiController {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

  const registry = { listProjects: jest.fn(), getProject: jest.fn(), reload: jest.fn() } as unknown as jest.Mocked<ProjectRegistryService>;
  const queueService = { enqueue: jest.fn(), pauseGlobal: jest.fn(), resumeGlobal: jest.fn() } as unknown as jest.Mocked<QueueService>;
  const queueRepo = { list: jest.fn() } as unknown as jest.Mocked<QueueRepository>;
  const sessionManager = { getActiveSessions: jest.fn(), getSessionTail: jest.fn(), getSessionLogs: jest.fn(), terminate: jest.fn() } as unknown as jest.Mocked<SessionManager>;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<OperatorActionLogService>;

  return new ApiController(
    registry,
    queueService,
    queueRepo,
    sessionManager,
    auditLog,
    (contextBudget ?? makeMockContextBudget()) as unknown as ContextBudgetService,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiController — GET /api/v1/sessions/:id/usage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env['ORCH_TRACE_BACKEND_UI_URL'];
  });

  it('returns empty samples and zero totals when no spans observed for session', () => {
    const cb = makeMockContextBudget(null);
    const controller = buildController(cb);

    const result = controller.getSessionUsage('session-xyz', {});

    expect(cb.getUsage).toHaveBeenCalledWith('session-xyz');
    expect(result.samples).toHaveLength(0);
    expect(result.totals.inputTokens).toBe(0);
    expect(result.totals.outputTokens).toBe(0);
    expect(result.totals.cacheReadTokens).toBe(0);
    expect(result.totals.costUsd).toBe(0);
  });

  it('returns aggregated samples from ContextBudgetService', () => {
    const mockUsage: SessionUsageResponse = {
      samples: [
        {
          ts: '2026-04-25T10:00:00.000Z',
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 0,
          model: 'claude-sonnet-4-6',
          costUsd: 0.003 + 0.0075,
        },
        {
          ts: '2026-04-25T10:01:00.000Z',
          inputTokens: 2000,
          outputTokens: 800,
          cacheReadTokens: 100,
          model: 'claude-sonnet-4-6',
          costUsd: 0.006 + 0.012 + 0.00003,
        },
      ],
      totals: {
        inputTokens: 3000,
        outputTokens: 1300,
        cacheReadTokens: 100,
        costUsd: 0.0285 + 0.00003,
      },
    };
    const cb = makeMockContextBudget(mockUsage);
    const controller = buildController(cb);

    const result = controller.getSessionUsage('my-session', {});

    expect(result.samples).toHaveLength(2);
    expect(result.totals.inputTokens).toBe(3000);
    expect(result.totals.outputTokens).toBe(1300);
  });

  it('rejects bad query params with BadRequestException (I-10 zod validation)', () => {
    const controller = buildController();

    expect(() =>
      controller.getSessionUsage('sess-1', { since: 'not-a-date' } as never),
    ).toThrow(BadRequestException);
  });

  it('filters samples by since/until when provided', () => {
    const samples = [
      { ts: '2026-01-01T08:00:00.000Z', inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, model: 'claude-sonnet-4-6', costUsd: 0.001 },
      { ts: '2026-01-01T09:00:00.000Z', inputTokens: 200, outputTokens: 80, cacheReadTokens: 0, model: 'claude-sonnet-4-6', costUsd: 0.002 },
      { ts: '2026-01-01T10:00:00.000Z', inputTokens: 300, outputTokens: 100, cacheReadTokens: 0, model: 'claude-sonnet-4-6', costUsd: 0.003 },
    ];
    const cb = makeMockContextBudget({
      samples,
      totals: { inputTokens: 600, outputTokens: 230, cacheReadTokens: 0, costUsd: 0.006 },
    });
    const controller = buildController(cb);

    const result = controller.getSessionUsage('sess-1', {
      since: '2026-01-01T08:30:00.000Z',
      until: '2026-01-01T09:30:00.000Z',
    });

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]?.ts).toBe('2026-01-01T09:00:00.000Z');
    expect(result.totals.inputTokens).toBe(200);
    expect(result.totals.outputTokens).toBe(80);
  });
});

describe('ApiController — GET /api/v1/config', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env['ORCH_TRACE_BACKEND_UI_URL'];
  });

  it('returns empty string when ORCH_TRACE_BACKEND_UI_URL is not set', () => {
    delete process.env['ORCH_TRACE_BACKEND_UI_URL'];
    const controller = buildController();

    const result = controller.getConfig();

    expect(result.traceBackendUiUrl).toBe('');
  });

  it('returns ORCH_TRACE_BACKEND_UI_URL when set', () => {
    process.env['ORCH_TRACE_BACKEND_UI_URL'] = 'http://grafana.local:3000';
    const controller = buildController();

    const result = controller.getConfig();

    expect(result.traceBackendUiUrl).toBe('http://grafana.local:3000');
  });
});

describe('MODEL_PRICING — calculateCostUsd', () => {
  it('calculates cost correctly for claude-sonnet-4-6', () => {
    const cost = calculateCostUsd({
      modelId: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 1000,
      cacheReadTokens: 0,
    });
    // 1K input × $0.003/1K = $0.003; 1K output × $0.015/1K = $0.015
    expect(cost).toBeCloseTo(0.018, 6);
  });

  it('calculates cost correctly for claude-opus-4-7', () => {
    const cost = calculateCostUsd({
      modelId: 'claude-opus-4-7',
      inputTokens: 1000,
      outputTokens: 1000,
      cacheReadTokens: 0,
    });
    // 1K input × $0.015/1K = $0.015; 1K output × $0.075/1K = $0.075
    expect(cost).toBeCloseTo(0.09, 6);
  });

  it('returns 0 for unknown model (I-14: no silent bugs)', () => {
    const cost = calculateCostUsd({
      modelId: 'completely-unknown-model',
      inputTokens: 10000,
      outputTokens: 5000,
      cacheReadTokens: 200,
    });
    expect(cost).toBe(0);
  });

  it('includes cache_read cost in calculation', () => {
    const pricing = MODEL_PRICING['claude-sonnet-4-6']!;
    const cost = calculateCostUsd({
      modelId: 'claude-sonnet-4-6',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1000,
    });
    expect(cost).toBeCloseTo(pricing.cacheReadPer1k, 6);
  });

  it('handles zero tokens without error', () => {
    const cost = calculateCostUsd({
      modelId: 'claude-haiku-4-5-20251001',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
    });
    expect(cost).toBe(0);
  });

  it('MODEL_PRICING has entries for all 3 primary models', () => {
    expect(MODEL_PRICING).toHaveProperty('claude-opus-4-7');
    expect(MODEL_PRICING).toHaveProperty('claude-sonnet-4-6');
    expect(MODEL_PRICING).toHaveProperty('claude-haiku-4-5-20251001');
  });
});
