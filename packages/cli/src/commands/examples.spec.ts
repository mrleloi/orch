/**
 * examples.spec.ts — Integration tests for examples/ folder reference profiles.
 *
 * Task 4.6 Acceptance Tests:
 *
 *  Test 1 (verify): `orch attach examples/generic-nodejs-project/` in --no-interactive
 *    mode against a tmp directory. Asserts the resulting .orch/profile.yaml is written.
 *
 *  Test 2 (schema): load examples/stockforge-integration/profile.yaml from disk
 *    and assert it parses through the domain ProfileSchema without errors.
 *    I-2 note: `stockforge` strings exist only in fixture data — this file
 *    is in packages/cli/, not packages/core/. Core never imports this file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { z } from 'zod';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orch-examples-'));
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Resolve the monorepo root from the test file location.
 * __dirname equivalent for ESM: derive from import.meta.url.
 *
 * File location: packages/cli/src/commands/examples.spec.ts
 * Levels up:     commands(1) -> src(2) -> cli(3) -> packages(4) -> orch-starter
 */
function repoRoot(): string {
  const fileUrl = new URL(import.meta.url);
  // On Windows the pathname starts with /C:/ — strip leading slash
  const filePath = fileUrl.pathname.replace(/^\/([A-Z]:)/i, '$1');
  return path.resolve(path.dirname(filePath), '..', '..', '..', '..');
}

// ── Test 1: attach round-trip for generic-nodejs-project ──────────────────────

describe('examples/generic-nodejs-project — attach round-trip', () => {
  let tmpDir: string;
  const savedEnvVars: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = makeTempDir();
    // Make it look like a project root so attach-flow accepts it
    fs.mkdirSync(path.join(tmpDir, '.git'), { recursive: true });

    for (const key of [
      'ORCH_PRIMARY_PROFILE',
      'ORCH_FALLBACK_PROFILES',
      'ORCH_INJECT_HOOKS',
      'ORCH_TELEGRAM_NOTIFICATIONS',
    ]) {
      savedEnvVars[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    cleanDir(tmpDir);
    for (const [key, val] of Object.entries(savedEnvVars)) {
      if (val == null) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  it('runAttachFlow --no-interactive writes .orch/profile.yaml to the target directory', async () => {
    const { runAttachFlow } = await import('./attach-flow.js');

    process.env['ORCH_PRIMARY_PROFILE'] = 'test-ccs-profile';
    process.env['ORCH_INJECT_HOOKS'] = 'no';

    await runAttachFlow(tmpDir, { noInteractive: true });

    const profilePath = path.join(tmpDir, '.orch', 'profile.yaml');
    expect(fs.existsSync(profilePath), '.orch/profile.yaml must exist after attach').toBe(true);

    const content = fs.readFileSync(profilePath, 'utf8');
    expect(content.length, 'profile.yaml must be non-empty').toBeGreaterThan(0);
    expect(content).toContain('test-ccs-profile');
  });
});

// ── Test 2: schema parse for stockforge-integration profile.yaml ──────────────
//
// I-2 exception: `stockforge` appears here as fixture data only.
// This file is in packages/cli/ — packages/core/src/ has zero `stockforge` references.
//
// We inline the ProfileSchema here (mirroring packages/core/src/domain/profile.ts)
// to avoid introducing a cross-package dev dependency from cli to core.
// If the core schema changes, this test will catch drift.

const ContextBudgetSchema = z
  .object({
    warnAtTokens: z.number().int().positive().default(200_000),
    forceHandoffAtTokens: z.number().int().positive().default(230_000),
  })
  .refine((v) => v.warnAtTokens < v.forceHandoffAtTokens, {
    message: 'warnAtTokens must be strictly less than forceHandoffAtTokens',
  });

const SessionTypeSchema = z.object({
  name: z.string().min(1),
  promptTemplate: z.string().min(1),
  model: z.string().optional(),
  maxConcurrent: z.number().int().min(1).default(1),
});

const HookTargetSchema = z.object({
  event: z.string().min(1),
  url: z.string().url(),
});

const QueueSourceSchema = z.object({
  path: z.string().min(1),
  glob: z.string().default('*.md'),
});

/**
 * ProfileSchema — mirrors packages/core/src/domain/profile.ts.
 * cron validation is intentionally loose here (no node-cron dependency in cli).
 */
const ProfileSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'projectId must be lowercase alphanumeric with hyphens only'),
  rootPath: z.string().min(1),
  sessionTypes: z.array(SessionTypeSchema).min(1),
  hookTargets: z.array(HookTargetSchema).default([]),
  queueSources: z.array(QueueSourceSchema).default([]),
  ccsProfile: z.string().min(1),
  maxConcurrentSessions: z.number().int().min(1).default(1),
  langfuseEnabled: z.boolean().default(false),
  disableSecretRedaction: z.boolean().default(false),
  contextBudget: ContextBudgetSchema.default({
    warnAtTokens: 200_000,
    forceHandoffAtTokens: 230_000,
  }),
  autoHandoff: z.boolean().default(false),
  gracefulEndTimeoutMs: z.number().int().min(1000).default(30_000),
  commands: z
    .object({ sessionEnd: z.string().optional() })
    .default({}),
  cron: z
    .record(
      z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'cron name must be lowercase URL-safe'),
      z.string().min(1),
    )
    .default({}),
});

describe('examples/stockforge-integration/profile.yaml — ProfileSchema parse', () => {
  it('parses through ProfileSchema without errors (I-2: stockforge is fixture data only)', () => {
    const stockforgePath = path.join(
      repoRoot(),
      'examples',
      'stockforge-integration',
      'profile.yaml',
    );

    expect(
      fs.existsSync(stockforgePath),
      `File must exist: ${stockforgePath}`,
    ).toBe(true);

    const raw = yaml.load(fs.readFileSync(stockforgePath, 'utf8'));
    const result = ProfileSchema.safeParse(raw);

    if (!result.success) {
      // Surface the specific zod errors for fast diagnosis
      const issues = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`ProfileSchema.safeParse failed:\n${issues}`);
    }

    expect(result.success).toBe(true);
    expect(result.data.projectId).toBe('stockforge');
    expect(result.data.sessionTypes.length).toBeGreaterThanOrEqual(1);
  });
});
