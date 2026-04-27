import { z } from 'zod';

export const ComponentEventSchema = z
  .object({
    ts: z.string().datetime(),
    component_type: z.enum(['skill', 'agent', 'command', 'hook']),
    component_name: z.string().min(1),
    trigger: z.enum([
      'keyword_match',
      'explicit_invoke',
      'agent_dispatch',
      'hook_event',
      'user_prompt',
      'sched_idle',
    ]),
    outcome: z.enum(['ok', 'reject', 'timeout', 'error', 'no_op']),
    tokens_self: z.number().int().min(0).optional(),
    tokens_real: z.number().int().min(0).optional(),
    duration_ms: z.number().int().min(0),
    session_id: z.string().nullable(),
    task_id: z.string().nullable(),
    decision: z.enum(['approve', 'deny', 'modify']).optional(),
    // Phase 5.3.5 — SC-12: Mode H = hook deny (decision=deny on PreToolUse).
    failure_mode: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']).nullable(),
  })
  .strict(); // unknown fields rejected (defends schema drift)

export type ComponentEvent = z.infer<typeof ComponentEventSchema>;

// Helper for ad-hoc readers (rollup script, future Phase 6 dashboards):
export function parseTelemetryLine(line: string): ComponentEvent | null {
  try {
    return ComponentEventSchema.parse(JSON.parse(line));
  } catch {
    return null; // malformed lines are skipped, not thrown — append-only durability
  }
}
