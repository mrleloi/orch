/**
 * fire-synthetic-span.ts — Test helper for creating synthetic OTEL spans
 * with context-budget attributes pre-populated.
 *
 * Used by both unit tests and the integration spec (B2) so the attribute
 * shape is consistent across all test scenarios.
 */

import type { Tracer } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_INPUT_TOKENS,
  ATTR_PROJECT_ID,
  ATTR_SESSION_KEY,
} from '../../src/modules/context-budget/context-budget.constants.js';

/**
 * Open, set attributes, and immediately end a synthetic span.
 *
 * @param tracer       - Active tracer (from NodeTracerProvider.getTracer()).
 * @param sessionKey   - Value for the `session.key` attribute.
 * @param projectId    - Value for the `project.id` attribute.
 * @param inputTokens  - Value for the `gen_ai.usage.input_tokens` attribute.
 */
export function fireSyntheticSpan(
  tracer: Tracer,
  sessionKey: string,
  projectId: string,
  inputTokens: number,
): void {
  const span = tracer.startSpan('gen_ai.completion');
  span.setAttribute(ATTR_SESSION_KEY, sessionKey);
  span.setAttribute(ATTR_PROJECT_ID, projectId);
  span.setAttribute(ATTR_GEN_AI_INPUT_TOKENS, inputTokens);
  span.end();
}
