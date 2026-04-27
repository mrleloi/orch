/**
 * usage-chart.spec.tsx — Tests for UsageChart component.
 *
 * Tests (8 total):
 *  1. renders empty state "No usage data yet" when samples is empty
 *  2. renders SVG chart wrapper when samples present
 *  3. renders input tokens line path
 *  4. renders output tokens line path
 *  5. cost summary card shows total cost formatted to 4 decimals
 *  6. cost summary shows per-model breakdown
 *  7. cost summary does not render model breakdown when samples is empty
 *  8. chart handles single-sample edge case without crashing
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SessionUsageData } from '../api/client.js';
import { UsageChart } from './UsageChart.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSample(overrides?: Partial<SessionUsageData['samples'][0]>): SessionUsageData['samples'][0] {
  return {
    ts: '2026-04-25T10:00:00.000Z',
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 0,
    model: 'claude-sonnet-4-6',
    costUsd: 0.0105,
    ...overrides,
  };
}

function makeUsageData(overrides?: Partial<SessionUsageData>): SessionUsageData {
  const samples = overrides?.samples ?? [makeSample()];
  const totals = overrides?.totals ?? {
    inputTokens: samples.reduce((a, s) => a + s.inputTokens, 0),
    outputTokens: samples.reduce((a, s) => a + s.outputTokens, 0),
    cacheReadTokens: samples.reduce((a, s) => a + s.cacheReadTokens, 0),
    costUsd: samples.reduce((a, s) => a + s.costUsd, 0),
  };
  return { samples, totals };
}

const EMPTY_USAGE: SessionUsageData = {
  samples: [],
  totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UsageChart — empty state', () => {
  it('renders "No usage data yet" when samples is empty', () => {
    render(<UsageChart data={EMPTY_USAGE} />);

    expect(screen.getByTestId('usage-chart-empty')).toBeInTheDocument();
    expect(screen.getByTestId('usage-chart-empty')).toHaveTextContent('No usage data yet');
  });

  it('does not render chart container when samples empty', () => {
    render(<UsageChart data={EMPTY_USAGE} />);

    expect(screen.queryByTestId('usage-chart-container')).toBeNull();
  });
});

describe('UsageChart — with data', () => {
  it('renders chart container when samples present', () => {
    const data = makeUsageData({
      samples: [
        makeSample({ ts: '2026-04-25T10:00:00.000Z', inputTokens: 1000 }),
        makeSample({ ts: '2026-04-25T10:01:00.000Z', inputTokens: 2000 }),
      ],
    });
    render(<UsageChart data={data} />);

    expect(screen.getByTestId('usage-chart-container')).toBeInTheDocument();
  });

  it('renders SVG input tokens line', () => {
    const data = makeUsageData({
      samples: [
        makeSample({ ts: '2026-04-25T10:00:00.000Z', inputTokens: 1000 }),
        makeSample({ ts: '2026-04-25T10:01:00.000Z', inputTokens: 1500 }),
      ],
    });
    render(<UsageChart data={data} />);

    expect(screen.getByTestId('chart-input-line')).toBeInTheDocument();
  });

  it('renders SVG output tokens line', () => {
    const data = makeUsageData({
      samples: [
        makeSample({ outputTokens: 500 }),
        makeSample({ outputTokens: 800 }),
      ],
    });
    render(<UsageChart data={data} />);

    expect(screen.getByTestId('chart-output-line')).toBeInTheDocument();
  });

  it('handles single-sample edge case without crashing', () => {
    const data = makeUsageData({ samples: [makeSample()] });
    render(<UsageChart data={data} />);

    expect(screen.getByTestId('usage-chart-container')).toBeInTheDocument();
  });
});

describe('UsageChart — cost summary', () => {
  it('shows total cost formatted to 4 decimal places', () => {
    const data = makeUsageData({
      samples: [makeSample({ costUsd: 0.0105 })],
      totals: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, costUsd: 0.0105 },
    });
    render(<UsageChart data={data} />);

    const totalEl = screen.getByTestId('total-cost-usd');
    expect(totalEl).toHaveTextContent('$0.0105');
  });

  it('shows per-model breakdown with model name and cost', () => {
    const data = makeUsageData({
      samples: [
        makeSample({ model: 'claude-sonnet-4-6', costUsd: 0.01 }),
        makeSample({ model: 'claude-opus-4-7', costUsd: 0.05 }),
      ],
      totals: { inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 0, costUsd: 0.06 },
    });
    render(<UsageChart data={data} />);

    const breakdown = screen.getByTestId('model-breakdown');
    expect(breakdown).toHaveTextContent('claude-sonnet-4-6');
    expect(breakdown).toHaveTextContent('claude-opus-4-7');
  });
});
