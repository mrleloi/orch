import { z } from 'zod';

/**
 * HookDecision — discriminator for what a hook tells the daemon to do with
 * the in-flight tool use (PreToolUse) or session turn (Stop).
 *
 * Per claude-code-learn §Permission engine: claude CLI's permission model is
 * allow/deny/ask/modify. Orch's hook-receiver only sees the decision after the
 * CLI has resolved it; "ask" never reaches us (interactive). We thus model
 * the 3 terminal decisions only.
 *
 * I-10: this schema gates EVERY hook payload that may contain a `decision`
 * field. Untyped fields never enter domain logic.
 */
export const HookDecisionSchema = z.enum(['approve', 'deny', 'modify']);

export type HookDecision = z.infer<typeof HookDecisionSchema>;

/**
 * Optional decision payload appended to PreToolUse / PostToolUse / Stop hook
 * bodies. When absent, the daemon treats the event as `decision=approve` by
 * default (backward compat — existing hook fixtures have no decision field).
 */
export const HookDecisionPayloadSchema = z
  .object({
    decision: HookDecisionSchema.optional(),
    message: z.string().optional(), // human-readable reason; surfaced in session log
  })
  .strict();

export type HookDecisionPayload = z.infer<typeof HookDecisionPayloadSchema>;
