/**
 * layered-resolver.spec.ts — unit tests for LayeredResolver.
 *
 * Spec authority: agent-workspace/constitution/config-layering.md §4
 * All 8 required test cases + optional Test #9.
 *
 * Uses in-memory fileLoader (no real filesystem); no tmpdir required.
 * Logger spies verify warn/debug call behaviour per spec assertions.
 */

import {
  LayeredResolver,
  LayerLoadError,
  buildDefaultLayers,
  resolveUserConfigPath,
  SystemDefaultsSchema,
  UserConfigSchema,
  ProjectProfileSchema,
  RepoOverrideSchema,
  type LayerSource,
  type LayeredResolverOptions,
} from './layered-resolver.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Build a minimal valid profile.yaml content for Layer 3 tests. */
function minimalProfileYaml(): string {
  return [
    'projectId: test-project',
    'rootPath: /workspace/test-project',
    'ccsProfile: subscription-1',
    'sessionTypes:',
    '  - name: focused-impl',
    '    promptTemplate: "Implement {{plan}}"',
  ].join('\n');
}

/**
 * Build a LayeredResolver with an in-memory file map.
 * Keys are absolute paths; values are file content strings.
 * Paths not in the map return null (file not found).
 */
function makeResolver(
  fileMap: Record<string, string>,
  layers: LayerSource[],
  opts: Omit<LayeredResolverOptions, 'layers' | 'fileLoader'> = {},
): LayeredResolver {
  const fileLoader = (p: string): string | null => fileMap[p] ?? null;
  return new LayeredResolver({ layers, fileLoader, ...opts });
}

/** Create a spy logger that records calls. */
function makeSpyLogger() {
  const warnCalls: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
  const debugCalls: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
  return {
    logger: {
      warn(msg: string, ctx?: Record<string, unknown>) {
        warnCalls.push({ msg, ctx });
      },
      debug(msg: string, ctx?: Record<string, unknown>) {
        debugCalls.push({ msg, ctx });
      },
    },
    warnCalls,
    debugCalls,
  };
}

// ── Layer source fixtures ────────────────────────────────────────────────────

const SYSTEM_PATH = '/fake/dist/defaults.json';
const USER_PATH = '/fake/home/.orch/config.yaml';
const PROJECT_PATH = '/fake/project/.orch/profile.yaml';
const REPO_PATH = '/fake/project/.orch/profile.local.yaml';

/** Canonical 4-layer descriptor array with in-memory-friendly paths. */
const ALL_FOUR_LAYERS: LayerSource[] = [
  { name: 'system',  path: SYSTEM_PATH,  schema: SystemDefaultsSchema },
  { name: 'user',    path: USER_PATH,    schema: UserConfigSchema },
  { name: 'project', path: PROJECT_PATH, schema: ProjectProfileSchema },
  { name: 'repo',    path: REPO_PATH,    schema: RepoOverrideSchema },
];

// ── Test #1 — All 4 layers present + merged correctly ────────────────────────
// Spec §4.1

describe('Test #1 — all 4 layers present + merged correctly', () => {
  it('merges non-conflicting keys from all 4 layers; deeper layer wins on conflict', () => {
    const fileMap: Record<string, string> = {
      [SYSTEM_PATH]: JSON.stringify({
        log_level: 'info',
        heartbeat_timeout_ms: 180000,
      }),
      [USER_PATH]: 'log_level: debug\ndefault_model: opus',
      [PROJECT_PATH]: minimalProfileYaml(),
      [REPO_PATH]: 'log_level: trace\nccsProfile: my-personal-ccs',
    };

    const resolver = makeResolver(fileMap, ALL_FOUR_LAYERS);
    const result = resolver.resolve();

    // Layer 4 (repo) wins on log_level over layers 1+2+3
    expect(result['log_level']).toBe('trace');
    // Layer 2 (user) provides default_model (no conflict with other layers)
    expect(result['default_model']).toBe('opus');
    // Layer 1 system: heartbeat_timeout_ms not overridden by deeper layers
    expect(result['heartbeat_timeout_ms']).toBe(180000);
    // Layer 4 repo: ccsProfile wins over layer 3's ccsProfile
    expect(result['ccsProfile']).toBe('my-personal-ccs');
    // Layer 3 project: projectId present (not overridden)
    expect(result['projectId']).toBe('test-project');
  });
});

// ── Test #2 — Layers 2-4 missing (graceful degradation) ─────────────────────
// Spec §4.2

describe('Test #2 — layers 2-4 missing in default mode', () => {
  it('resolves to layer 1 content; logger.debug called for each missing layer; no throw', () => {
    const { logger, debugCalls } = makeSpyLogger();

    const fileMap: Record<string, string> = {
      [SYSTEM_PATH]: JSON.stringify({ log_level: 'info', heartbeat_timeout_ms: 180000 }),
      // USER_PATH, PROJECT_PATH, REPO_PATH intentionally absent
    };

    const resolver = makeResolver(fileMap, ALL_FOUR_LAYERS, { logger });
    const result = resolver.resolve();

    expect(result['log_level']).toBe('info');
    expect(result['heartbeat_timeout_ms']).toBe(180000);

    // debug should have been called for each missing layer (2, 3, 4)
    const missingLayerDebugCalls = debugCalls.filter((c) =>
      c.msg.includes('not found'),
    );
    expect(missingLayerDebugCalls.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Test #3 — Type mismatch (warns + last-layer-wins) ────────────────────────
// Spec §4.3

describe('Test #3 — type mismatch warns and last-layer-wins', () => {
  it('string vs object: last-layer (user) wins; logger.warn emitted with type-mismatch context', () => {
    const { logger, warnCalls } = makeSpyLogger();

    const layers: LayerSource[] = [
      { name: 'system', path: SYSTEM_PATH, schema: SystemDefaultsSchema },
      { name: 'user',   path: USER_PATH,   schema: UserConfigSchema },
    ];

    const fileMap: Record<string, string> = {
      // Layer 1: some_key is a string
      [SYSTEM_PATH]: JSON.stringify({ some_key: 'string-value' }),
      // Layer 2: some_key is an object (type conflict)
      [USER_PATH]: 'some_key:\n  nested: true',
    };

    const resolver = makeResolver(fileMap, layers, { logger });
    const result = resolver.resolve();

    // Layer 2 (object) wins over Layer 1 (string)
    expect(result['some_key']).toEqual({ nested: true });

    // warn must have been called for the type mismatch
    const mismatchWarns = warnCalls.filter((c) => c.msg.includes('type mismatch'));
    expect(mismatchWarns.length).toBeGreaterThanOrEqual(1);
    expect(mismatchWarns[0]?.ctx).toMatchObject({ key: 'some_key' });
  });
});

// ── Test #4 — Array merge: concat-dedup (#4a) and !override replace (#4b) ───
// Spec §4.4

describe('Test #4 — array merge semantics', () => {
  it('#4a default: concat-with-dedup (2 unique entries merged into 1 array)', () => {
    const hookA = { event: 'SessionStart', url: 'http://127.0.0.1:4141/hooks/start' };
    const hookB = { event: 'Stop',         url: 'http://127.0.0.1:4141/hooks/stop' };

    const layers: LayerSource[] = [
      { name: 'user',    path: USER_PATH,    schema: UserConfigSchema },
      { name: 'project', path: PROJECT_PATH, schema: ProjectProfileSchema },
    ];

    const projectYaml = [
      minimalProfileYaml(),
      'hookTargets:',
      `  - event: ${hookB.event}`,
      `    url: "${hookB.url}"`,
    ].join('\n');

    const fileMap: Record<string, string> = {
      [USER_PATH]: `hookTargets:\n  - event: ${hookA.event}\n    url: "${hookA.url}"`,
      [PROJECT_PATH]: projectYaml,
    };

    const resolver = makeResolver(fileMap, layers);
    const result = resolver.resolve();
    const targets = result['hookTargets'] as Array<{ event: string; url: string }>;

    expect(targets).toHaveLength(2);
    expect(targets.some((t) => t.event === hookA.event)).toBe(true);
    expect(targets.some((t) => t.event === hookB.event)).toBe(true);
  });

  it('#4a dedup: identical entries from two layers appear only once', () => {
    const hook = { event: 'SessionStart', url: 'http://127.0.0.1:4141/hooks/start' };
    const hookYaml = `hookTargets:\n  - event: ${hook.event}\n    url: "${hook.url}"`;

    const layers: LayerSource[] = [
      { name: 'user',  path: USER_PATH,  schema: UserConfigSchema },
      { name: 'repo',  path: REPO_PATH,  schema: RepoOverrideSchema },
    ];

    const fileMap: Record<string, string> = {
      [USER_PATH]: hookYaml,
      [REPO_PATH]: hookYaml, // identical — should dedup
    };

    const resolver = makeResolver(fileMap, layers);
    const result = resolver.resolve();
    const targets = result['hookTargets'] as unknown[];
    expect(targets).toHaveLength(1);
  });

  it('#4b !override: repo layer replaces user layer array entirely', () => {
    const hookOld1 = { event: 'SessionStart', url: 'http://127.0.0.1:4141/hooks/start' };
    const hookOld2 = { event: 'Stop',         url: 'http://127.0.0.1:4141/hooks/stop' };
    const hookNew  = { event: 'SessionStart', url: 'http://127.0.0.1:4141/hooks/custom-start' };

    const layers: LayerSource[] = [
      { name: 'user', path: USER_PATH, schema: UserConfigSchema },
      { name: 'repo', path: REPO_PATH, schema: RepoOverrideSchema },
    ];

    const userYaml = [
      'hookTargets:',
      `  - event: ${hookOld1.event}`,
      `    url: "${hookOld1.url}"`,
      `  - event: ${hookOld2.event}`,
      `    url: "${hookOld2.url}"`,
    ].join('\n');

    // Note: repo uses hookTargets!override to replace
    const repoYaml = [
      'hookTargets!override:',
      `  - event: ${hookNew.event}`,
      `    url: "${hookNew.url}"`,
    ].join('\n');

    const fileMap: Record<string, string> = {
      [USER_PATH]: userYaml,
      [REPO_PATH]: repoYaml,
    };

    const resolver = makeResolver(fileMap, layers);
    const result = resolver.resolve();
    const targets = result['hookTargets'] as Array<{ event: string; url: string }>;

    // Only the new entry from repo layer (old ones discarded)
    expect(targets).toHaveLength(1);
    expect(targets[0]).toEqual(hookNew);
  });
});

// ── Test #5 — Zod schema validation rejects bad layer (default mode skip) ───
// Spec §4.5

describe('Test #5 — Zod validation rejects bad layer in default mode', () => {
  it('invalid log_level in user layer: layer skipped; warn emitted; no throw', () => {
    const { logger, warnCalls } = makeSpyLogger();

    const layers: LayerSource[] = [
      { name: 'system', path: SYSTEM_PATH, schema: SystemDefaultsSchema },
      { name: 'user',   path: USER_PATH,   schema: UserConfigSchema },
    ];

    const fileMap: Record<string, string> = {
      [SYSTEM_PATH]: JSON.stringify({ log_level: 'info' }),
      // invalid enum value for log_level in user layer
      [USER_PATH]: 'log_level: invalid-level',
    };

    const resolver = makeResolver(fileMap, layers, { logger });
    const result = resolver.resolve();

    // Layer 2 was skipped; result comes only from layer 1
    expect(result['log_level']).toBe('info');

    const validationWarns = warnCalls.filter((c) => c.msg.includes("failed to load"));
    expect(validationWarns.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Test #6 — Layer 3 telemetry-key REJECTED at schema-parse ─────────────────
// Spec §4.6, Decision 031 cross-binding

describe('Test #6 — Layer 3 telemetry key rejected (Decision 031)', () => {
  const profileWithTelemetry = [
    minimalProfileYaml(),
    'telemetry:',
    '  enabled: true',
  ].join('\n');

  it('default mode: layer 3 skipped + warn; remaining layers merged', () => {
    const { logger, warnCalls } = makeSpyLogger();

    const layers: LayerSource[] = [
      { name: 'system',  path: SYSTEM_PATH,  schema: SystemDefaultsSchema },
      { name: 'project', path: PROJECT_PATH, schema: ProjectProfileSchema },
    ];

    const fileMap: Record<string, string> = {
      [SYSTEM_PATH]: JSON.stringify({ log_level: 'info' }),
      [PROJECT_PATH]: profileWithTelemetry,
    };

    const resolver = makeResolver(fileMap, layers, { logger });
    const result = resolver.resolve();

    // Layer 3 was rejected; telemetry.enabled should NOT appear in result
    const nested = result['telemetry'] as Record<string, unknown> | undefined;
    expect(nested?.['enabled']).toBeUndefined();

    const telemetryRejectWarns = warnCalls.filter((c) =>
      c.msg.includes("failed to load") && c.ctx?.['layerName'] === 'project',
    );
    expect(telemetryRejectWarns.length).toBeGreaterThanOrEqual(1);
  });

  it('strict mode: LayerLoadError thrown with layerName=project', () => {
    const layers: LayerSource[] = [
      { name: 'system',  path: SYSTEM_PATH,  schema: SystemDefaultsSchema },
      { name: 'project', path: PROJECT_PATH, schema: ProjectProfileSchema },
    ];

    const fileMap: Record<string, string> = {
      [SYSTEM_PATH]: JSON.stringify({ log_level: 'info' }),
      [PROJECT_PATH]: profileWithTelemetry,
    };

    const resolver = makeResolver(fileMap, layers, { mode: 'strict' });

    expect(() => resolver.resolve()).toThrow(LayerLoadError);

    try {
      resolver.resolve();
    } catch (err) {
      expect(err).toBeInstanceOf(LayerLoadError);
      expect((err as LayerLoadError).layerName).toBe('project');
      expect((err as LayerLoadError).message).toMatch(/telemetry/i);
    }
  });
});

// ── Test #7 — Malformed YAML → graceful skip with warning ────────────────────
// Spec §4.7

describe('Test #7 — malformed YAML in layer (default mode)', () => {
  it('parse error: layer skipped; warn emitted with parse-error details; no throw', () => {
    const { logger, warnCalls } = makeSpyLogger();

    const layers: LayerSource[] = [
      { name: 'system', path: SYSTEM_PATH, schema: SystemDefaultsSchema },
      { name: 'user',   path: USER_PATH,   schema: UserConfigSchema },
    ];

    const fileMap: Record<string, string> = {
      [SYSTEM_PATH]: JSON.stringify({ log_level: 'info' }),
      // Malformed YAML: unclosed bracket / invalid structure
      [USER_PATH]: 'log_level: [unclosed bracket',
    };

    const resolver = makeResolver(fileMap, layers, { logger });
    const result = resolver.resolve();

    // Layer 2 skipped; result comes only from layer 1
    expect(result['log_level']).toBe('info');

    // Warn should have been called with the parse error
    const parseErrorWarns = warnCalls.filter((c) =>
      c.msg.includes("failed to load") && c.ctx?.['layerName'] === 'user',
    );
    expect(parseErrorWarns.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Test #8 — Cross-platform path resolution ─────────────────────────────────
// Spec §4.8

describe('Test #8 — cross-platform path resolution for user config', () => {
  const FAKE_PROJECT = '/fake/project';
  const FAKE_SYSTEM = '/fake/dist/defaults.json';

  afterEach(() => {
    // Restore env vars modified in each sub-test
    delete process.env['XDG_CONFIG_HOME'];
    delete process.env['HOME'];
    delete process.env['USERPROFILE'];
  });

  it('POSIX HOME: layer 2 path resolves to $HOME/.orch/config.yaml', () => {
    process.env['HOME'] = '/fake/home';
    delete process.env['XDG_CONFIG_HOME'];
    delete process.env['USERPROFILE'];

    const layers = buildDefaultLayers(FAKE_PROJECT, '/fake/home', FAKE_SYSTEM);
    const userLayer = layers.find((l) => l.name === 'user');

    // Normalize separators for cross-platform (Windows join uses backslashes)
    expect(userLayer?.path.replace(/\\/g, '/')).toBe('/fake/home/.orch/config.yaml');
  });

  it('Windows USERPROFILE: layer 2 path resolves to %USERPROFILE%\\.orch\\config.yaml', () => {
    delete process.env['HOME'];
    delete process.env['XDG_CONFIG_HOME'];
    process.env['USERPROFILE'] = 'C:\\Users\\fake';

    const layers = buildDefaultLayers(FAKE_PROJECT, 'C:\\Users\\fake', FAKE_SYSTEM);
    const userLayer = layers.find((l) => l.name === 'user');

    // join() on Windows uses backslashes; normalize for assertion
    expect(userLayer?.path.replace(/\\/g, '/')).toBe('C:/Users/fake/.orch/config.yaml');
  });

  it('XDG_CONFIG_HOME: layer 2 path is $XDG_CONFIG_HOME/orch/config.yaml', () => {
    process.env['XDG_CONFIG_HOME'] = '/xdg/conf';
    process.env['HOME'] = '/should/not/be/used';

    const path = resolveUserConfigPath();
    expect(path?.replace(/\\/g, '/')).toBe('/xdg/conf/orch/config.yaml');
  });
});

// ── Test #9 (optional) — Strict mode throws on first failure ─────────────────
// Spec §4.9

describe('Test #9 — strict mode throws on first missing layer', () => {
  it('layers 1+3 valid; layer 2 missing; strict mode → LayerLoadError for user', () => {
    const layers: LayerSource[] = [
      { name: 'system',  path: SYSTEM_PATH,  schema: SystemDefaultsSchema },
      { name: 'user',    path: USER_PATH,    schema: UserConfigSchema },
      { name: 'project', path: PROJECT_PATH, schema: ProjectProfileSchema },
    ];

    const fileMap: Record<string, string> = {
      [SYSTEM_PATH]: JSON.stringify({ log_level: 'info' }),
      // USER_PATH intentionally absent
      [PROJECT_PATH]: minimalProfileYaml(),
    };

    const resolver = makeResolver(fileMap, layers, { mode: 'strict' });

    expect(() => resolver.resolve()).toThrow(LayerLoadError);

    try {
      resolver.resolve();
    } catch (err) {
      expect(err).toBeInstanceOf(LayerLoadError);
      expect((err as LayerLoadError).layerName).toBe('user');
    }
  });
});
