/**
 * env-propagation.ts — pure helper for building the propagated subprocess env
 * for the Claude Code adapter. Lifted out of the adapter to enable unit-testing
 * the propagation rules in isolation (no execa / child_process mocking needed).
 *
 * I-14: pure functions; no module-level mutable state.
 * I-1:  zero LLM calls; pure object construction.
 *
 * Architecture: this file IS PART OF the sessions module (NOT the adapters
 * dir per architecture.md §Layer 3, which is the sub-folder convention used
 * by the project). It is exported from sessions.module.ts only as an
 * implementation detail of the ClaudeCodeAdapter, NOT as a public service.
 */

/** The 8 enumerated vars, plus the OTLP prefix. Single source of truth. */
export const PROPAGATED_ENV_VARS: readonly string[] = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'CLAUDE_CODE_REMOTE',
  'TRACEPARENT',
] as const;

export const PROPAGATED_ENV_PREFIXES: readonly string[] = [
  'OTEL_EXPORTER_OTLP_',
] as const;

/**
 * Build the env object for `execa` to inherit. Caller-supplied `extraEnv`
 * takes precedence over both literal and prefix matches (allows test
 * overrides + matches existing buildEnv() behavior in claude-code-adapter.ts).
 *
 * Existing TRACEPARENT injection via TracingService is preserved — caller
 * pre-merges the traceparent into `parentEnv` before invoking this helper, so
 * the literal name 'TRACEPARENT' here is for parent-process-env passthrough
 * only (e.g., when called outside an OTEL span).
 */
export function buildPropagatedEnv(
  parentEnv: NodeJS.ProcessEnv,
  extraEnv: Record<string, string> | undefined,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};

  // 1. Literal matches
  for (const key of PROPAGATED_ENV_VARS) {
    const val = parentEnv[key];
    if (val !== undefined) out[key] = val;
  }

  // 2. Prefix matches (Q-extra Q3 — wildcard for OTLP family)
  for (const key of Object.keys(parentEnv)) {
    for (const prefix of PROPAGATED_ENV_PREFIXES) {
      if (key.startsWith(prefix) && parentEnv[key] !== undefined) {
        out[key] = parentEnv[key]!;
      }
    }
  }

  // 3. Caller overrides win (matches existing buildEnv contract)
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      out[k] = v;
    }
  }

  return out;
}
