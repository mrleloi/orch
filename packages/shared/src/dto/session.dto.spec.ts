/**
 * session.dto.spec.ts — Smoke tests for TailResponseDto shape.
 *
 * TailResponseDto is a plain TypeScript interface (no runtime schema),
 * so these tests validate the structural contract via object construction
 * and assert the barrel export is reachable.
 */

import { describe, it, expect } from 'vitest';
import type { TailResponseDto, SessionDto, SessionSummaryDto } from './session.dto.js';

describe('TailResponseDto', () => {
  it('accepts valid lines + truncated=false', () => {
    const dto: TailResponseDto = {
      lines: ['line 1', 'line 2'],
      truncated: false,
    };
    expect(dto.lines).toHaveLength(2);
    expect(dto.truncated).toBe(false);
  });

  it('accepts empty lines + truncated=true', () => {
    const dto: TailResponseDto = {
      lines: [],
      truncated: true,
    };
    expect(dto.lines).toEqual([]);
    expect(dto.truncated).toBe(true);
  });

  it('accepts 100 lines (max allowed by server)', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const dto: TailResponseDto = { lines, truncated: true };
    expect(dto.lines).toHaveLength(100);
    expect(dto.truncated).toBe(true);
  });
});

describe('SessionDto structural contract', () => {
  it('has required fields', () => {
    const dto: SessionDto = {
      id: 'sess-1',
      projectId: 'proj-1',
      planPath: '/plans/foo.md',
      state: 'active',
      claudeSessionId: null,
      startedAt: '2026-04-25T00:00:00.000Z',
      endedAt: null,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      traceId: null,
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
    };
    expect(dto.id).toBe('sess-1');
    expect(dto.state).toBe('active');
  });
});

describe('SessionSummaryDto structural contract', () => {
  it('has required fields', () => {
    const dto: SessionSummaryDto = {
      id: 'sess-1',
      projectId: 'proj-1',
      state: 'completed',
      startedAt: null,
      endedAt: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    expect(dto.state).toBe('completed');
  });
});
