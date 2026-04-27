/**
 * mock-project-registry.ts — Minimal stub for ProjectRegistryService used in
 * context-budget unit tests.
 *
 * Exposes the same `cache` Map that ContextBudgetService accesses via the
 * internal cache accessor pattern used in resolveThresholds().
 */

import type { ContextBudgetThresholds } from '../../src/modules/context-budget/context-budget.types.js';

/** Minimal profile shape needed by ContextBudgetService. */
export interface MockProfile {
  contextBudget?: ContextBudgetThresholds;
}

/**
 * Build a mock ProjectRegistryService stub.
 *
 * @param projects  Map of projectId → partial profile (only contextBudget used).
 */
export function buildMockProjectRegistry(
  projects: Record<string, MockProfile> = {},
): { cache: Map<string, MockProfile> } {
  const cache = new Map<string, MockProfile>(Object.entries(projects));
  return { cache };
}
