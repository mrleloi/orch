/**
 * layered-resolver.ts — deterministic 4-layer config resolver.
 *
 * Domain-layer ZERO framework dependency (architecture.md §"Domain layer").
 * Imports: zod, js-yaml, node:path only. NO NestJS imports.
 * I-14 NO singleton: resolver is instantiated per-call, not module-level.
 * I-1 daemon-dumb: pure deterministic merge; zero LLM calls.
 * I-2 project-agnostic: zero hardcoded project/user paths.
 *
 * Spec authority: agent-workspace/constitution/config-layering.md §3
 */

import { z } from 'zod';
import { load as yamlLoad } from 'js-yaml';
import { join } from 'node:path';

import { ProfileSchema } from '../domain/profile.js';

// ── Per-layer Zod schemas ────────────────────────────────────────────────────

/**
 * Layer 1 — system defaults shipped in npm tarball.
 * Permits all config keys including telemetry (defaults only).
 * Spec §2.4, §1.1.
 */
export const SystemDefaultsSchema = z
  .object({
    budget: z
      .object({
        warn_at_tokens: z.number().int().positive().optional(),
        force_handoff_at_tokens: z.number().int().positive().optional(),
      })
      .optional(),
    heartbeat_timeout_ms: z.number().int().positive().optional(),
    absolute_ceiling_ms: z.number().int().positive().optional(),
    log_level: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .optional(),
    http: z
      .object({
        port: z.number().int().positive().optional(),
        host: z.string().optional(),
      })
      .optional(),
    trace_backend: z.string().optional(),
    telemetry: z
      .object({
        enabled: z.boolean().optional(),
        endpoint: z.string().optional(),
        include_user_hash: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

export type SystemDefaults = z.infer<typeof SystemDefaultsSchema>;

/**
 * Layer 2 — user config (~/.orch/config.yaml or XDG path).
 * PERMITS telemetry.* keys (user-scope only per Decision 031).
 * Spec §1.2, §2.4.
 */
export const UserConfigSchema = z
  .object({
    log_level: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .optional(),
    default_model: z.string().optional(),
    telemetry: z
      .object({
        enabled: z.boolean().optional(),
        endpoint: z.string().optional(),
        include_user_hash: z.boolean().optional(),
      })
      .optional(),
    ui: z
      .object({
        preferred_editor: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export type UserConfig = z.infer<typeof UserConfigSchema>;

/**
 * Layer 3 — project profile (<project>/.orch/profile.yaml).
 * Re-uses frozen ProfileSchema from domain/profile.ts.
 * REJECTS telemetry.* keys (Decision 031; §1.5; §2.4).
 * Spec §1.3, §2.4.
 *
 * Zod strips unknown keys before superRefine sees the data, so we run a
 * pre-check on the raw unknown input via z.preprocess before delegating
 * to ProfileSchema. This ensures telemetry.* rejection fires correctly even
 * though ProfileSchema itself doesn't declare a `telemetry` field.
 */
export const ProjectProfileSchema = z.preprocess((raw, ctx) => {
  // Inspect the raw input BEFORE Zod strips unknown keys.
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'telemetry' in (raw as Record<string, unknown>)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['telemetry'],
      message:
        'telemetry.* keys are not allowed in Layer 3 (project profile) per Decision 031. ' +
        'Move telemetry config to ~/.orch/config.yaml (user scope).',
    });
    return z.NEVER; // abort parse; upstream sees validation failure
  }
  return raw; // pass through to ProfileSchema
}, ProfileSchema);

/**
 * Layer 4 — repo override (<project>/.orch/profile.local.yaml, gitignored).
 * REJECTS telemetry.* keys (Decision 031; §1.4).
 * Accepts a flexible passthrough schema; project-typed fields optional here.
 * Spec §1.4, §2.4.
 */
export const RepoOverrideSchema = z
  .object({
    log_level: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .optional(),
    ccsProfile: z.string().optional(),
    contextBudget: z
      .object({
        warnAtTokens: z.number().int().positive().optional(),
        forceHandoffAtTokens: z.number().int().positive().optional(),
      })
      .optional(),
    hookTargets: z
      .array(
        z.object({
          event: z.string().min(1),
          url: z.string().url(),
        }),
      )
      .optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    // Telemetry rejection — Decision 031 §"Default state" line 88.
    const keys = Object.keys(data);
    const telemetryKey = keys.find(
      (k) => k === 'telemetry' || k === 'telemetry!override',
    );
    if (telemetryKey !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['telemetry'],
        message:
          'telemetry.* keys are not allowed in Layer 4 (repo override) per Decision 031. ' +
          'Move telemetry config to ~/.orch/config.yaml (user scope).',
      });
    }
  });

export type RepoOverride = z.infer<typeof RepoOverrideSchema>;

// ── Public API types ─────────────────────────────────────────────────────────

/** A single layer source descriptor — what to load and how to label it. Spec §3. */
export interface LayerSource {
  /** Layer identity. Used for logging and resolution-order assertions. */
  name: 'system' | 'user' | 'project' | 'repo';
  /**
   * Absolute path to the layer's YAML/JSON file.
   *
   * For Layer 1 (system): dist-bundled defaults.json.
   * For Layer 2 (user): $HOME-resolved per spec §1.2.
   * For Layer 3 (project): <root>/.orch/profile.yaml.
   * For Layer 4 (repo): <root>/.orch/profile.local.yaml.
   */
  path: string;
  /** Zod schema to validate the layer's parsed content. */
  schema: z.ZodTypeAny;
}

/** Resolution mode controlling missing-layer / parse-failure behavior. Spec §3. */
export type ResolutionMode = 'default' | 'strict';

/** Resolver options. Constructor input. Spec §3. */
export interface LayeredResolverOptions {
  layers: LayerSource[];
  mode?: ResolutionMode; // default: 'default'
  /**
   * File loader injectable. Defaults to synchronous fs.readFileSync.
   * Return null if the file does not exist; throw on unexpected IO errors.
   * Domain-pure: resolver never calls fs directly — caller provides this.
   */
  fileLoader?: (path: string) => string | null;
  /** Optional logger. Defaults to no-op so domain layer stays framework-free. */
  logger?: {
    warn(msg: string, ctx?: Record<string, unknown>): void;
    debug(msg: string, ctx?: Record<string, unknown>): void;
  };
}

/** Output of LayeredResolver.resolve() — deep-merged config. Spec §3. */
export type ResolvedConfig = Record<string, unknown>;

/**
 * Error thrown when a layer fails to load OR fails Zod validation in strict mode.
 *
 * In default mode, layer failures are logged and skipped — this error is NOT thrown.
 * In strict mode, the first failure throws and the resolver aborts.
 *
 * I-12: domain-layer error class; wrapped at adapter boundary if needed.
 * Spec §3.
 */
export class LayerLoadError extends Error {
  constructor(
    public readonly layerName: LayerSource['name'],
    public readonly layerPath: string,
    public readonly cause: unknown,
  ) {
    super(
      `[layered-resolver] layer '${layerName}' at '${layerPath}' failed to load: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'LayerLoadError';
  }
}

// ── No-op logger (default) ───────────────────────────────────────────────────

const NOOP_LOGGER: Required<NonNullable<LayeredResolverOptions['logger']>> = {
  warn: () => undefined,
  debug: () => undefined,
};

// ── Deep-merge helpers ───────────────────────────────────────────────────────

/**
 * Stable JSON stringify for deduplication of array elements.
 * Sorts object keys for determinism.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return (
    '{' +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          stableStringify((value as Record<string, unknown>)[k]),
      )
      .join(',') +
    '}'
  );
}

/**
 * Deep-merge B into A. Higher-precedence B wins on scalar conflicts.
 * Arrays concat-with-dedup by default; `!override` suffix on key replaces.
 * Type mismatches: B wins + logger.warn.
 * Spec §2.1, §2.2.
 */
function deepMerge(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  logger: Required<NonNullable<LayeredResolverOptions['logger']>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...a };

  for (const rawKey of Object.keys(b)) {
    // Handle !override directive for arrays (spec §2.2)
    const isOverride = rawKey.endsWith('!override');
    const key = isOverride ? rawKey.slice(0, -'!override'.length) : rawKey;
    const bVal = b[rawKey];
    const aVal = result[key];

    if (aVal === undefined) {
      // Key only in B — adopt directly
      result[key] = bVal;
      continue;
    }

    // Both present — apply merge strategy
    if (Array.isArray(aVal) && Array.isArray(bVal)) {
      if (isOverride) {
        // Replace: discard A's array entirely (spec §2.2)
        result[key] = bVal;
      } else {
        // Concat-with-dedup (spec §2.2)
        const aArr = aVal as unknown[];
        const seen = new Set<string>(aArr.map(stableStringify));
        const extras = (bVal as unknown[]).filter(
          (el) => !seen.has(stableStringify(el)),
        );
        result[key] = [...aArr, ...extras];
      }
    } else if (
      aVal !== null &&
      bVal !== null &&
      typeof aVal === 'object' &&
      typeof bVal === 'object' &&
      !Array.isArray(aVal) &&
      !Array.isArray(bVal)
    ) {
      // Both objects — recurse
      result[key] = deepMerge(
        aVal as Record<string, unknown>,
        bVal as Record<string, unknown>,
        logger,
      );
    } else if (
      typeof aVal !== typeof bVal ||
      Array.isArray(aVal) !== Array.isArray(bVal)
    ) {
      // Type mismatch — B wins; emit warn (spec §2.1)
      logger.warn('[layered-resolver] type mismatch on key; last-layer-wins', {
        key,
        aType: Array.isArray(aVal) ? 'array' : typeof aVal,
        bType: Array.isArray(bVal) ? 'array' : typeof bVal,
      });
      result[key] = bVal;
    } else {
      // Same scalar/null type — B wins
      result[key] = bVal;
    }
  }

  return result;
}

// ── Default file loader (wraps node:fs synchronously) ───────────────────────

function makeDefaultFileLoader(): (path: string) => string | null {
  // Lazy import so the domain resolver itself doesn't import fs at module parse
  // time — only the default loader touches fs, and only if injected.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  return (filePath: string): string | null => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null; // file does not exist — caller treats null as missing-layer
      }
      throw err; // unexpected IO error — propagate
    }
  };
}

// ── LayeredResolver ──────────────────────────────────────────────────────────

/**
 * LayeredResolver — deterministic, framework-free 4-layer config resolver.
 *
 * Pure-functional core; no module-level state (I-14).
 * Domain-layer ZERO framework dependency (architecture.md §"Domain layer").
 * Daemon-dumb-compliant: NO LLM logic; pure deterministic merge (I-1).
 * Spec §3, §2.
 */
export class LayeredResolver {
  private readonly mode: ResolutionMode;
  private readonly fileLoader: (path: string) => string | null;
  private readonly logger: Required<
    NonNullable<LayeredResolverOptions['logger']>
  >;

  constructor(private readonly options: LayeredResolverOptions) {
    this.mode = options.mode ?? 'default';
    this.fileLoader = options.fileLoader ?? makeDefaultFileLoader();
    this.logger = options.logger
      ? {
          warn: options.logger.warn.bind(options.logger),
          debug:
            options.logger.debug?.bind(options.logger) ?? NOOP_LOGGER.debug,
        }
      : NOOP_LOGGER;
  }

  /**
   * Resolve all layers in declared order; return merged config.
   * Spec §2 resolution algorithm.
   *
   * @throws LayerLoadError if mode='strict' and any layer fails to load or parse.
   * @returns ResolvedConfig — deep-merged output across all layers.
   */
  resolve(): ResolvedConfig {
    let result: Record<string, unknown> = {};

    for (const layer of this.options.layers) {
      // Step 2a — load raw content
      let raw: string | null;
      try {
        raw = this.fileLoader(layer.path);
      } catch (err) {
        const loadErr = new LayerLoadError(layer.name, layer.path, err);
        if (this.mode === 'strict') throw loadErr;
        this.logger.warn(loadErr.message, {
          layerName: layer.name,
          path: layer.path,
        });
        continue;
      }

      if (raw === null) {
        // File does not exist — missing layer
        if (this.mode === 'strict') {
          throw new LayerLoadError(
            layer.name,
            layer.path,
            new Error('file not found'),
          );
        }
        this.logger.debug(
          `[layered-resolver] layer '${layer.name}' not found at '${layer.path}' — skipping`,
          { layerName: layer.name, path: layer.path },
        );
        continue;
      }

      // Parse YAML/JSON
      let parsed: unknown;
      try {
        parsed = yamlLoad(raw);
      } catch (err) {
        const parseErr = new LayerLoadError(
          layer.name,
          layer.path,
          err instanceof Error ? err : new Error(String(err)),
        );
        if (this.mode === 'strict') throw parseErr;
        this.logger.warn(parseErr.message, {
          layerName: layer.name,
          path: layer.path,
        });
        continue;
      }

      // Step 2b — validate against layer schema
      const zodResult = layer.schema.safeParse(parsed);
      if (!zodResult.success) {
        const zodErr = new LayerLoadError(
          layer.name,
          layer.path,
          new Error(zodResult.error.message),
        );
        if (this.mode === 'strict') throw zodErr;
        this.logger.warn(zodErr.message, {
          layerName: layer.name,
          path: layer.path,
          zodIssues: zodResult.error.issues,
        });
        continue;
      }

      // Step 2c — deep-merge into result
      result = deepMerge(
        result,
        zodResult.data as Record<string, unknown>,
        this.logger,
      );
    }

    return result;
  }
}

// ── Path resolution helpers ──────────────────────────────────────────────────

/**
 * Resolve the user home directory for Layer 2 path construction.
 * Priority: XDG_CONFIG_HOME → HOME/.config → HOME → USERPROFILE
 * Spec §1.2.
 *
 * Returns an object with { xdgConfigHome, home } for the caller to use
 * when building the user config path.
 */
export function resolveUserHome(): {
  /** If XDG_CONFIG_HOME is set, the orch config path is $XDG_CONFIG_HOME/orch/config.yaml */
  xdgConfigHome: string | undefined;
  /** The resolved home directory (~-equivalent). */
  home: string | undefined;
} {
  const xdg = process.env['XDG_CONFIG_HOME'];
  const home = process.env['HOME'] ?? process.env['USERPROFILE'];
  return { xdgConfigHome: xdg || undefined, home: home || undefined };
}

/**
 * Resolve the Layer 2 user config file path.
 * Resolution order per spec §1.2:
 *  1. $XDG_CONFIG_HOME/orch/config.yaml
 *  2. $HOME/.config/orch/config.yaml  (POSIX fallback)
 *  3. $HOME/.orch/config.yaml         (Windows + macOS-Unix simple)
 *  4. %USERPROFILE%\.orch\config.yaml (Windows fallback)
 *
 * Returns the first matching path candidate (caller may pass to fileLoader).
 * If neither XDG nor HOME nor USERPROFILE is resolvable, returns undefined.
 */
export function resolveUserConfigPath(): string | undefined {
  const { xdgConfigHome, home } = resolveUserHome();

  if (xdgConfigHome) {
    return join(xdgConfigHome, 'orch', 'config.yaml');
  }
  if (home) {
    // Prefer ~/.config/orch/config.yaml on POSIX; fall back to ~/.orch/config.yaml
    // For simplicity, we return the ~/.orch path which is the Windows-compatible form.
    // A caller on pure POSIX can override via XDG_CONFIG_HOME.
    return join(home, '.orch', 'config.yaml');
  }
  return undefined;
}

/**
 * Build the canonical 4-layer source descriptor for a given project.
 *
 * Helper used by daemon entry-points to construct the standard layering.
 * Each layer's schema is bound here; downstream LayeredResolver consumes the array.
 * Spec §3 buildDefaultLayers.
 *
 * @param projectRoot absolute path to the managed project root
 * @param userHome absolute path to the user home dir (resolved by caller from env vars)
 * @param systemDefaultsPath absolute path to the dist-bundled defaults.json
 */
export function buildDefaultLayers(
  projectRoot: string,
  userHome: string,
  systemDefaultsPath: string,
): LayerSource[] {
  const { xdgConfigHome } = resolveUserHome();

  const userConfigPath = xdgConfigHome
    ? join(xdgConfigHome, 'orch', 'config.yaml')
    : join(userHome, '.orch', 'config.yaml');

  return [
    {
      name: 'system',
      path: systemDefaultsPath,
      schema: SystemDefaultsSchema,
    },
    {
      name: 'user',
      path: userConfigPath,
      schema: UserConfigSchema,
    },
    {
      name: 'project',
      path: join(projectRoot, '.orch', 'profile.yaml'),
      schema: ProjectProfileSchema,
    },
    {
      name: 'repo',
      path: join(projectRoot, '.orch', 'profile.local.yaml'),
      schema: RepoOverrideSchema,
    },
  ];
}
