/**
 * Unit tests for Profile entity and zod schema.
 *
 * Validates:
 * - Valid profiles parse successfully
 * - Required fields are enforced
 * - Defaults are applied correctly
 * - projectId format constraint works
 * - parseProfile() returns typed safe-parse results
 */

import { ProfileSchema, parseProfile, ContextBudgetSchema } from './profile';

/** Minimal valid profile — all required fields, no extras. */
function minimalProfile(): Record<string, unknown> {
  return {
    projectId: 'my-project',
    rootPath: '/home/user/projects/my-project',
    sessionTypes: [
      {
        name: 'impl',
        promptTemplate: 'Implement the following plan:\n\n{{plan}}',
      },
    ],
    ccsProfile: 'personal',
  };
}

describe('ProfileSchema — valid profiles', () => {
  it('parses a minimal valid profile', () => {
    const result = ProfileSchema.safeParse(minimalProfile());
    expect(result.success).toBe(true);
  });

  it('applies default values for optional fields', () => {
    const result = ProfileSchema.safeParse(minimalProfile());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const data = result.data;
    expect(data.hookTargets).toEqual([]);
    expect(data.queueSources).toEqual([]);
    expect(data.maxConcurrentSessions).toBe(1);
    expect(data.langfuseEnabled).toBe(false);
    expect(data.disableSecretRedaction).toBe(false);
  });

  it('accepts a fully-specified profile', () => {
    const full: Record<string, unknown> = {
      ...minimalProfile(),
      hookTargets: [
        { event: 'SessionStart', url: 'http://127.0.0.1:2080/hooks/SessionStart' },
        { event: 'SessionEnd', url: 'http://127.0.0.1:2080/hooks/SessionEnd' },
      ],
      queueSources: [
        { path: '/home/user/plans', glob: '*.md' },
      ],
      maxConcurrentSessions: 2,
      langfuseEnabled: true,
      disableSecretRedaction: false,
    };

    const result = ProfileSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it('accepts multiple session types', () => {
    const profile = {
      ...minimalProfile(),
      sessionTypes: [
        { name: 'impl', promptTemplate: 'Implement: {{plan}}' },
        { name: 'review', promptTemplate: 'Review: {{plan}}', maxConcurrent: 2 },
      ],
    };

    const result = ProfileSchema.safeParse(profile);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.sessionTypes).toHaveLength(2);
  });

  it('infers correct types after parsing', () => {
    const result = ProfileSchema.safeParse(minimalProfile());
    expect(result.success).toBe(true);
    if (!result.success) return;

    const profile = result.data;
    // TypeScript type narrowing confirms typed fields
    expect(typeof profile.projectId).toBe('string');
    expect(typeof profile.rootPath).toBe('string');
    expect(Array.isArray(profile.sessionTypes)).toBe(true);
    expect(typeof profile.ccsProfile).toBe('string');
  });
});

describe('ProfileSchema — invalid profiles', () => {
  it('rejects missing projectId', () => {
    const { projectId: _unused, ...noId } = minimalProfile();
    void _unused;
    const result = ProfileSchema.safeParse(noId);
    expect(result.success).toBe(false);
  });

  it('rejects missing rootPath', () => {
    const { rootPath: _unused, ...noPath } = minimalProfile();
    void _unused;
    const result = ProfileSchema.safeParse(noPath);
    expect(result.success).toBe(false);
  });

  it('rejects missing ccsProfile', () => {
    const { ccsProfile: _unused, ...noCcs } = minimalProfile();
    void _unused;
    const result = ProfileSchema.safeParse(noCcs);
    expect(result.success).toBe(false);
  });

  it('rejects empty sessionTypes array', () => {
    const result = ProfileSchema.safeParse({ ...minimalProfile(), sessionTypes: [] });
    expect(result.success).toBe(false);
  });

  it('rejects projectId with uppercase letters', () => {
    const result = ProfileSchema.safeParse({ ...minimalProfile(), projectId: 'MyProject' });
    expect(result.success).toBe(false);
  });

  it('rejects projectId with spaces', () => {
    const result = ProfileSchema.safeParse({ ...minimalProfile(), projectId: 'my project' });
    expect(result.success).toBe(false);
  });

  it('rejects projectId with underscores', () => {
    const result = ProfileSchema.safeParse({ ...minimalProfile(), projectId: 'my_project' });
    expect(result.success).toBe(false);
  });

  it('rejects hookTarget with invalid URL', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      hookTargets: [{ event: 'SessionStart', url: 'not-a-url' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects sessionType missing promptTemplate', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      sessionTypes: [{ name: 'impl' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxConcurrentSessions of 0', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      maxConcurrentSessions: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('ContextBudgetSchema', () => {
  it('applies defaults when no values provided', () => {
    const result = ContextBudgetSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.warnAtTokens).toBe(200_000);
    expect(result.data.forceHandoffAtTokens).toBe(230_000);
  });

  it('accepts explicit valid values', () => {
    const result = ContextBudgetSchema.safeParse({
      warnAtTokens: 50_000,
      forceHandoffAtTokens: 60_000,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.warnAtTokens).toBe(50_000);
    expect(result.data.forceHandoffAtTokens).toBe(60_000);
  });

  it('rejects warn >= force (warn equals force)', () => {
    const result = ContextBudgetSchema.safeParse({
      warnAtTokens: 100_000,
      forceHandoffAtTokens: 100_000,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes('warnAtTokens must be strictly less than forceHandoffAtTokens'))).toBe(true);
  });

  it('rejects warn > force', () => {
    const result = ContextBudgetSchema.safeParse({
      warnAtTokens: 230_000,
      forceHandoffAtTokens: 200_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative numbers (I-10: zod rejects non-positive)', () => {
    const result = ContextBudgetSchema.safeParse({
      warnAtTokens: -1,
      forceHandoffAtTokens: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer values', () => {
    const result = ContextBudgetSchema.safeParse({
      warnAtTokens: 200_000.5,
      forceHandoffAtTokens: 230_000,
    });
    expect(result.success).toBe(false);
  });
});

describe('ProfileSchema — contextBudget field', () => {
  function minimalProfile(): Record<string, unknown> {
    return {
      projectId: 'my-project',
      rootPath: '/home/user/projects/my-project',
      sessionTypes: [
        { name: 'impl', promptTemplate: 'Implement the following plan:\n\n{{plan}}' },
      ],
      ccsProfile: 'personal',
    };
  }

  it('applies contextBudget defaults when block is omitted', () => {
    const result = ProfileSchema.safeParse(minimalProfile());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contextBudget.warnAtTokens).toBe(200_000);
    expect(result.data.contextBudget.forceHandoffAtTokens).toBe(230_000);
  });

  it('accepts explicit contextBudget block', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      contextBudget: { warnAtTokens: 50_000, forceHandoffAtTokens: 60_000 },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contextBudget.warnAtTokens).toBe(50_000);
    expect(result.data.contextBudget.forceHandoffAtTokens).toBe(60_000);
  });

  it('rejects contextBudget block where warn >= force', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      contextBudget: { warnAtTokens: 230_000, forceHandoffAtTokens: 200_000 },
    });
    expect(result.success).toBe(false);
  });
});

describe('ProfileSchema — cron field (Task 3.7, T-SCHED-1)', () => {
  it('T-SCHED-1: rejects malformed cron expression at profile-load time', () => {
    const raw = {
      ...minimalProfile(),
      cron: { bad: 'not a cron' },
    };
    const result = parseProfile(raw);
    expect(result.success).toBe(false);
    if (result.success) return;

    // Error path must include ['cron', 'bad']
    const issues = result.error.issues;
    const cronIssue = issues.find((i) =>
      Array.isArray(i.path) && i.path.includes('cron') && i.path.includes('bad'),
    );
    expect(cronIssue).toBeDefined();
    expect(cronIssue?.message).toMatch(/invalid cron expression/i);
  });

  it('accepts valid cron map with correct expressions', () => {
    const raw = {
      ...minimalProfile(),
      cron: {
        'daily-run': '0 9 * * *',
        'hourly': '0 * * * *',
      },
    };
    const result = parseProfile(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cron['daily-run']).toBe('0 9 * * *');
    expect(result.data.cron['hourly']).toBe('0 * * * *');
  });

  it('rejects cron name with invalid characters (uppercase)', () => {
    const raw = {
      ...minimalProfile(),
      cron: { BadName: '0 9 * * *' },
    };
    const result = parseProfile(raw);
    expect(result.success).toBe(false);
  });

  it('defaults to empty cron map when cron field is omitted', () => {
    const result = parseProfile(minimalProfile());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cron).toEqual({});
  });

  it('accepts 6-field (per-second) cron expression', () => {
    // node-cron v4 validate() accepts both 5-field and 6-field expressions.
    // The 6-field form adds a seconds field as the first position: "* * * * * *".
    // This test guards against a node-cron major-version bump that drops 6-field support.
    const raw = {
      ...minimalProfile(),
      cron: { 'every-sec': '* * * * * *' },
    };
    const result = parseProfile(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cron['every-sec']).toBe('* * * * * *');
  });
});

describe('ProfileSchema — worktreeIsolation + baseBranch fields (Phase 6.3, Decision 018)', () => {
  // T1: minimal profile applies defaults for both new fields
  it('T1: applies worktreeIsolation:false and baseBranch:"main" defaults for minimal profile', () => {
    const result = ProfileSchema.safeParse(minimalProfile());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.worktreeIsolation).toBe(false);
    expect(result.data.baseBranch).toBe('main');
  });

  // T2: explicit opt-in values are preserved through parse
  it('T2: accepts explicit worktreeIsolation:true and baseBranch:"develop"; values preserved', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      worktreeIsolation: true,
      baseBranch: 'develop',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.worktreeIsolation).toBe(true);
    expect(result.data.baseBranch).toBe('develop');
  });

  // T3: empty baseBranch string violates min(1) — must fail parse
  it('T3: rejects baseBranch:"" (empty string) — min(1) violation', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      baseBranch: '',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(
      messages.some((m) => m.toLowerCase().includes('least') || m.toLowerCase().includes('min') || m.toLowerCase().includes('string')),
    ).toBe(true);
  });

  // T4: string 'true' for worktreeIsolation violates boolean type — must fail parse
  it('T4: rejects worktreeIsolation:"true" (string, not boolean) — type mismatch', () => {
    const result = ProfileSchema.safeParse({
      ...minimalProfile(),
      worktreeIsolation: 'true',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(
      messages.some((m) => m.toLowerCase().includes('boolean') || m.toLowerCase().includes('expected boolean')),
    ).toBe(true);
  });
});

describe('parseProfile', () => {
  it('returns success:true for valid input', () => {
    const result = parseProfile(minimalProfile());
    expect(result.success).toBe(true);
  });

  it('returns success:false for invalid input', () => {
    const result = parseProfile({ projectId: '' });
    expect(result.success).toBe(false);
  });

  it('does not throw — always returns SafeParseReturnType', () => {
    expect(() => parseProfile(null)).not.toThrow();
    expect(() => parseProfile(undefined)).not.toThrow();
    expect(() => parseProfile(42)).not.toThrow();
  });

  it('returns typed data on success', () => {
    const result = parseProfile(minimalProfile());
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.projectId).toBe('my-project');
    expect(result.data.ccsProfile).toBe('personal');
  });
});
