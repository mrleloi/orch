/**
 * model-pricing.ts — Centralized MODEL_PRICING table for cost calculation.
 *
 * Prices are in USD per 1,000 tokens (i.e., cost_usd = tokens / 1000 * price_per_1k).
 *
 * I-1: No LLM imports. Pure constants.
 * I-2: No project-specific names.
 * I-14: No framework imports.
 *
 * Sources: Anthropic pricing page (as of 2026-04).
 * TODO: These prices are approximate and may drift; check https://www.anthropic.com/pricing
 *   before billing-critical use. Encoding as placeholders; exact values TBD from official page.
 *
 * Pricing reference (approximate, per 1M tokens):
 *   claude-opus-4-7:          input $15 / output $75
 *   claude-sonnet-4-6:        input $3  / output $15
 *   claude-haiku-4-5-20251001: input $1 / output $5
 *
 * Converted to per-1K: divide by 1000.
 */

export interface ModelPricing {
  /** USD per 1,000 input tokens */
  inputPer1k: number;
  /** USD per 1,000 output tokens */
  outputPer1k: number;
  /** USD per 1,000 cache-read tokens (typically ~10% of input price) */
  cacheReadPer1k: number;
}

/**
 * MODEL_PRICING — keyed by model ID (as reported in gen_ai.request.model span attribute).
 *
 * If a model ID is not found, cost_usd defaults to 0 (unknown model — caller
 * should log a warning but not crash).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-7': {
    inputPer1k: 0.015, // $15 / MTok = $0.015 / 1K
    outputPer1k: 0.075, // $75 / MTok = $0.075 / 1K
    cacheReadPer1k: 0.0015, // ~10% of input
  },
  'claude-sonnet-4-6': {
    inputPer1k: 0.003, // $3 / MTok = $0.003 / 1K
    outputPer1k: 0.015, // $15 / MTok = $0.015 / 1K
    cacheReadPer1k: 0.0003, // ~10% of input
  },
  'claude-haiku-4-5-20251001': {
    inputPer1k: 0.001, // $1 / MTok = $0.001 / 1K
    outputPer1k: 0.005, // $5 / MTok = $0.005 / 1K
    cacheReadPer1k: 0.0001, // ~10% of input
  },
} as const;

/**
 * Calculate cost in USD for a given token usage.
 *
 * Returns 0 if the modelId is not found in MODEL_PRICING (unknown model).
 */
export function calculateCostUsd(opts: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}): number {
  const pricing = MODEL_PRICING[opts.modelId];
  if (pricing === undefined) {
    return 0;
  }
  return (
    (opts.inputTokens / 1000) * pricing.inputPer1k +
    (opts.outputTokens / 1000) * pricing.outputPer1k +
    (opts.cacheReadTokens / 1000) * pricing.cacheReadPer1k
  );
}
