/**
 * envelope-schema.ts — Zod schema for dogfood self-task envelopes.
 *
 * Self-task envelopes are YAML files at:
 *   agent-workspace/queue/self-tasks/<id>.yaml
 *
 * Validated per spec §3.1 (self-application-bootstrap.md).
 * The payload._self_app=true discriminator is added by the harness before
 * passing to QueueService.enqueue(); it is not part of this schema.
 *
 * Domain-pure: zero NestJS imports. Relies only on zod.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const TenancySchema = z.object({
  user: z.union([z.literal('self'), z.literal('orch-daemon')]),
  project: z.string().min(1),
  is_self_app: z.boolean(),
});

const PreflightAssertionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('i6_grep'),
    forbidden_substring: z.string().min(1),
    target: z.string().min(1),
  }),
  z.object({
    kind: z.literal('tenancy_lock'),
    expect_user: z.string().min(1),
    expect_project: z.string().min(1),
  }),
  z.object({
    kind: z.literal('budget_envelope'),
    max_tokens: z.number().int().positive(),
  }),
]);

const HandoffSchema = z.object({
  prior_substage: z.string().optional(),
  prior_artifacts: z.array(z.string()).optional(),
  expected_output_path: z.string().optional(),
  expected_output_min_bytes: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Root schema
// ---------------------------------------------------------------------------

export const DogfoodEnvelopeSchema = z.object({
  // Identity
  envelope_id: z.string().min(1),
  schema_version: z.literal('1'),

  // Tenancy
  tenancy: TenancySchema,

  // Dispatch routing
  subagent_type: z.string().min(1),
  model: z.union([z.literal('opus'), z.literal('sonnet'), z.literal('haiku')]),
  effort: z.union([z.literal('low'), z.literal('high'), z.literal('max')]),

  // Prompt + trace
  prompt_path: z.string().min(1),
  dispatch_trace_path: z.string().min(1),

  // Rollback
  rollback_marker_path: z.string().min(1),

  // Budget cap (T1 safeguard)
  budget_cap_tokens: z.number().int().positive().max(120000),

  // Optional sections
  handoff: HandoffSchema.optional(),
  preflight_assertions: z.array(PreflightAssertionSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Derived TypeScript types
// ---------------------------------------------------------------------------

export type DogfoodEnvelope = z.output<typeof DogfoodEnvelopeSchema>;
export type DogfoodTenancy = z.output<typeof TenancySchema>;
export type PreflightAssertion = z.output<typeof PreflightAssertionSchema>;
export type DogfoodHandoff = z.output<typeof HandoffSchema>;

/** Maximum budget cap enforced by the harness (T1 safeguard). */
export const MAX_DOGFOOD_BUDGET = 120_000;
