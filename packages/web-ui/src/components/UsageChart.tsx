/**
 * UsageChart.tsx - Hand-rolled SVG line chart for session token usage.
 *
 * Renders cumulative input + output tokens over time.
 * No chart library dependency (Recharts not in package.json; hand-rolled SVG
 * per Karpathy P2 — simplest thing that works).
 *
 * I-3: No @anthropic-ai / openai imports.
 * I-4: No @orch/core imports.
 */

import type { JSX } from 'react';
import type { UsageSample, SessionUsageData } from '../api/client.js';

// ── Sub-components ────────────────────────────────────────────────────────────

interface UsageChartProps {
  data: SessionUsageData;
}

/**
 * UsageChart — renders a line chart of cumulative tokens over time
 * plus a cost summary card.
 *
 * Empty state: "No usage data yet" when samples is empty.
 */
export function UsageChart({ data }: UsageChartProps): JSX.Element {
  if (data.samples.length === 0) {
    return (
      <div data-testid="usage-chart-empty" className="rounded border border-gray-200 p-4 text-sm text-gray-500">
        No usage data yet
      </div>
    );
  }

  return (
    <div data-testid="usage-chart-container" className="space-y-4">
      <SvgLineChart samples={data.samples} />
      <CostSummaryCard totals={data.totals} samples={data.samples} />
    </div>
  );
}

// ── SVG line chart ────────────────────────────────────────────────────────────

const CHART_WIDTH = 600;
const CHART_HEIGHT = 200;
const PADDING = { top: 16, right: 24, bottom: 32, left: 56 };

interface SvgLineChartProps {
  samples: UsageSample[];
}

function SvgLineChart({ samples }: SvgLineChartProps): JSX.Element {
  // Build cumulative series using reduce to avoid reassignment (lint immutability rule)
  const points = samples.reduce<Array<{ x: number; cumInput: number; cumOutput: number; ts: string }>>(
    (acc, s, i) => {
      const prev = acc[i - 1];
      const cumInput = (prev?.cumInput ?? 0) + s.inputTokens;
      const cumOutput = (prev?.cumOutput ?? 0) + s.outputTokens;
      acc.push({ x: i, cumInput, cumOutput, ts: s.ts });
      return acc;
    },
    [],
  );

  const maxTokens = Math.max(
    points[points.length - 1]?.cumInput ?? 0,
    points[points.length - 1]?.cumOutput ?? 0,
    1,
  );

  const innerW = CHART_WIDTH - PADDING.left - PADDING.right;
  const innerH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const n = points.length;

  function xScale(i: number): number {
    if (n <= 1) return PADDING.left;
    return PADDING.left + (i / (n - 1)) * innerW;
  }

  function yScale(tokens: number): number {
    return PADDING.top + innerH - (tokens / maxTokens) * innerH;
  }

  function buildPath(getter: (p: { cumInput: number; cumOutput: number }) => number): string {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(getter(p)).toFixed(1)}`)
      .join(' ');
  }

  const inputPath = buildPath((p) => p.cumInput);
  const outputPath = buildPath((p) => p.cumOutput);

  // Y-axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    value: Math.round(maxTokens * f),
    y: yScale(maxTokens * f),
  }));

  // X-axis: first and last timestamp
  const xLabels = n >= 2
    ? [
        { i: 0, label: formatTime(points[0]!.ts) },
        { i: n - 1, label: formatTime(points[n - 1]!.ts) },
      ]
    : [{ i: 0, label: formatTime(points[0]!.ts) }];

  return (
    <div data-testid="usage-chart-svg-wrapper">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ width: '100%', height: 'auto' }}
        aria-label="Token usage over time"
        role="img"
      >
        {/* Grid lines */}
        {yTicks.map(({ value, y }) => (
          <line
            key={value}
            x1={PADDING.left}
            x2={CHART_WIDTH - PADDING.right}
            y1={y}
            y2={y}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        ))}

        {/* Input tokens line (blue) */}
        <path
          data-testid="chart-input-line"
          d={inputPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
        />

        {/* Output tokens line (green) */}
        <path
          data-testid="chart-output-line"
          d={outputPath}
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
        />

        {/* Y-axis labels */}
        {yTicks.map(({ value, y }) => (
          <text
            key={value}
            x={PADDING.left - 6}
            y={y + 4}
            textAnchor="end"
            fontSize={10}
            fill="#6b7280"
          >
            {formatTokens(value)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={xScale(i)}
            y={CHART_HEIGHT - 6}
            textAnchor={i === 0 ? 'start' : 'end'}
            fontSize={10}
            fill="#6b7280"
          >
            {label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 mt-1">
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 12, height: 3, background: '#3b82f6', borderRadius: 1 }} />
          Input tokens
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 12, height: 3, background: '#22c55e', borderRadius: 1 }} />
          Output tokens
        </span>
      </div>
    </div>
  );
}

// ── Cost summary card ─────────────────────────────────────────────────────────

interface CostSummaryCardProps {
  totals: SessionUsageData['totals'];
  samples: UsageSample[];
}

function CostSummaryCard({ totals, samples }: CostSummaryCardProps): JSX.Element {
  // Aggregate cost per model
  const modelMap = new Map<string, number>();
  for (const s of samples) {
    modelMap.set(s.model, (modelMap.get(s.model) ?? 0) + s.costUsd);
  }

  return (
    <div data-testid="cost-summary-card" className="rounded border p-4 space-y-3 text-sm">
      <h3 className="font-semibold">Cost Summary</h3>

      <div className="flex gap-6 flex-wrap">
        <div>
          <span className="text-gray-500">Total cost</span>
          <div data-testid="total-cost-usd" className="font-mono font-semibold">
            ${totals.costUsd.toFixed(4)}
          </div>
        </div>
        <div>
          <span className="text-gray-500">Input tokens</span>
          <div className="font-mono">{totals.inputTokens.toLocaleString()}</div>
        </div>
        <div>
          <span className="text-gray-500">Output tokens</span>
          <div className="font-mono">{totals.outputTokens.toLocaleString()}</div>
        </div>
        {totals.cacheReadTokens > 0 && (
          <div>
            <span className="text-gray-500">Cache read</span>
            <div className="font-mono">{totals.cacheReadTokens.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Per-model breakdown */}
      {modelMap.size > 0 && (
        <div>
          <div className="text-gray-500 mb-1 text-xs uppercase tracking-wide">By model</div>
          <div data-testid="model-breakdown" className="space-y-1">
            {[...modelMap.entries()].map(([model, cost]) => (
              <div key={model} className="flex justify-between text-xs">
                <span className="font-mono text-gray-700">{model}</span>
                <span className="font-mono">${cost.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}
