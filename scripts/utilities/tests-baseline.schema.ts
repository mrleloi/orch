/**
 * tests-baseline.schema.ts — Zod schema for agent-workspace/memory/tests-baseline.json
 *
 * Single source of truth for the shape of the test-count baseline file.
 * Used by emit-tests-baseline.ts (writer) and emit-phase-complete.ts (reader).
 *
 * INV-S7: plain JSON, NOT a DB column. Never touch Prisma here.
 */

import { z } from 'zod';

export const TestsBaselineSchema = z.object({
  schema_version: z.literal('1'),
  generated_at: z.string().datetime(),
  totals: z.object({
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    skipped: z.number().int().min(0),
    duration_ms: z.number().int().min(0).optional(),
  }),
  per_phase: z.array(z.object({
    phase_id: z.string(),
    closed_at: z.string().datetime(),
    tests_total: z.number().int().min(0),
    tests_passed: z.number().int().min(0),
    notes: z.string().optional(),
  })),
  per_package: z.array(z.object({
    name: z.string(),
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    skipped: z.number().int().min(0),
  })),
}).strict();

export type TestsBaseline = z.infer<typeof TestsBaselineSchema>;
export type PerPhaseEntry = TestsBaseline['per_phase'][number];
export type PerPackageEntry = TestsBaseline['per_package'][number];
