/**
 * Profile entity + zod schema for `.orch/profile.yaml`.
 *
 * A Profile is the per-managed-project configuration that tells Orch how to
 * spawn sessions, which hooks to listen for, and which ccs account to use.
 *
 * The zod schema is the single source of truth — TypeScript types are inferred
 * from it to prevent schema-type drift. All external YAML input passes through
 * ProfileSchema.parse() before entering domain logic (I-10).
 *
 * I-2: No project-specific values or defaults. Profile keys use generic names
 * (projectId, ccsProfile, etc.) — project-specific values live in the YAML file.
 */

import { z } from 'zod';
import { validate as cronValidate } from 'node-cron';

// ── Context budget schema ─────────────────────────────────────────────────────

/**
 * Zod schema for the `contextBudget` block in profile.yaml.
 *
 * Thresholds default to charter F4 values (warnAt=200k, forceHandoffAt=230k).
 * I-10: all profile input passes through ProfileSchema.safeParse() before use.
 */
export const ContextBudgetSchema = z
  .object({
    warnAtTokens: z.number().int().positive().default(200_000),
    forceHandoffAtTokens: z.number().int().positive().default(230_000),
  })
  .refine((v) => v.warnAtTokens < v.forceHandoffAtTokens, {
    message: 'warnAtTokens must be strictly less than forceHandoffAtTokens',
  });

export type ContextBudgetConfig = z.infer<typeof ContextBudgetSchema>;

// ── Session type schema ───────────────────────────────────────────────────────

/**
 * A named session type defines how Orch dispatches a particular category of work.
 *
 * Examples: `{ name: "impl", promptTemplate: "..." }`,
 *           `{ name: "review", promptTemplate: "..." }`
 */
export const SessionTypeSchema = z.object({
  /** Unique name for this session type — used in session keys. */
  name: z.string().min(1),

  /**
   * Prompt template passed to `claude -p`.
   *
   * May contain `{{plan}}` placeholder which is replaced with the plan file content.
   */
  promptTemplate: z.string().min(1),

  /** Optional model override (e.g. "claude-opus-4-5"). Defaults to ccs account default. */
  model: z.string().optional(),

  /** Max concurrent sessions of this type (default 1 for serial execution). */
  maxConcurrent: z.number().int().min(1).default(1),
});

export type SessionTypeConfig = z.infer<typeof SessionTypeSchema>;

// ── Hook target schema ────────────────────────────────────────────────────────

/**
 * A hook target wires a Claude Code hook event to Orch's receiver endpoint.
 *
 * This is the shape that maps to each entry under `hookTargets:` in profile.yaml.
 * The actual hook registration lives in the managed project's `.claude/settings.json`.
 */
export const HookTargetSchema = z.object({
  /** Claude Code hook event name (e.g. "SessionStart", "Stop", "SessionEnd"). */
  event: z.string().min(1),

  /**
   * Full URL for the hook POST.
   *
   * Typically `http://127.0.0.1:2080/hooks/{event}` where 2080 is Orch's default port.
   */
  url: z.string().url(),
});

export type HookTargetConfig = z.infer<typeof HookTargetSchema>;

// ── Queue source schema ───────────────────────────────────────────────────────

/**
 * A queue source tells Orch where to watch for incoming plan files.
 *
 * Supports glob patterns for flexible directory structures.
 */
export const QueueSourceSchema = z.object({
  /** Absolute or `~`-prefixed path to the directory to watch. */
  path: z.string().min(1),

  /**
   * Glob pattern for plan files within the directory.
   *
   * Defaults to `*.md` (Markdown plan files).
   */
  glob: z.string().default('*.md'),
});

export type QueueSourceConfig = z.infer<typeof QueueSourceSchema>;

// ── Profile schema ────────────────────────────────────────────────────────────

/**
 * Full zod schema for `.orch/profile.yaml`.
 *
 * Use ProfileSchema.parse() or ProfileSchema.safeParse() on raw YAML input.
 * On validation failure, wrap the zod error in ProfileValidationError (I-10, I-12).
 */
export const ProfileSchema = z.object({
  // ── Identity ──────────────────────────────────────────────────────────────

  /**
   * Unique identifier for this project within Orch.
   *
   * Used as the first segment of session keys and in all log + trace attributes.
   * Must be URL-safe (lowercase, hyphens allowed, no spaces).
   */
  projectId: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-]+$/,
      'projectId must be lowercase alphanumeric with hyphens only',
    ),

  /**
   * Absolute path to the managed project root.
   *
   * Orch resolves plan file paths relative to this directory.
   */
  rootPath: z.string().min(1),

  // ── Session types ─────────────────────────────────────────────────────────

  /**
   * One or more session type definitions.
   *
   * Each type maps to a class of work items (impl, review, debug, etc.).
   * At least one session type is required for dispatching to work.
   */
  sessionTypes: z.array(SessionTypeSchema).min(1),

  // ── Hooks ─────────────────────────────────────────────────────────────────

  /**
   * Hook targets to register in the managed project's `.claude/settings.json`.
   *
   * If omitted, Orch will not receive real-time hook events (pull-mode only).
   */
  hookTargets: z.array(HookTargetSchema).default([]),

  // ── Queue ─────────────────────────────────────────────────────────────────

  /**
   * Directories to watch for incoming plan files.
   *
   * Defaults to `{rootPath}/session-plans/pending` if omitted.
   */
  queueSources: z.array(QueueSourceSchema).default([]),

  // ── Runtime ───────────────────────────────────────────────────────────────

  /**
   * Name of the ccs profile to use when spawning sessions for this project.
   *
   * Maps to a Claude Code account / API key configured in `ccs`.
   */
  ccsProfile: z.string().min(1),

  // ── Optional flags ────────────────────────────────────────────────────────

  /**
   * Maximum concurrent active sessions across ALL session types for this project.
   *
   * Defaults to 1 (serial execution). Override per session type via
   * `sessionTypes[*].maxConcurrent`.
   */
  maxConcurrentSessions: z.number().int().min(1).max(8).default(1),

  /**
   * Enable Langfuse as an alternative OTEL backend for this project.
   *
   * Requires `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` env vars.
   * Default: false (uses Grafana LGTM stack per D6).
   */
  langfuseEnabled: z.boolean().default(false),

  /**
   * Disable secret redaction on outbound text for this project.
   *
   * DANGER: only disable in fully-trusted, air-gapped environments.
   * Default: false (redaction enabled).
   */
  disableSecretRedaction: z.boolean().default(false),

  // ── Context budget ────────────────────────────────────────────────────────

  /**
   * Per-session context budget thresholds for the token detector (Task 3.2).
   *
   * Defaults to charter F4 values: warn at 200k, force handoff at 230k.
   * YAML key: `contextBudget:` (camelCase, matching existing profile conventions).
   */
  contextBudget: ContextBudgetSchema.default({
    warnAtTokens: 200_000,
    forceHandoffAtTokens: 230_000,
  }),

  // ── Graceful session end (Task 3.3) ───────────────────────────────────────

  /**
   * Autonomous handoff mode.
   *
   * When `true`: on `session.forceHandoff`, SessionManager immediately initiates
   * graceful session termination (writes slash-command → waits for SessionEnd hook
   * → SIGTERM → SIGKILL).
   *
   * When `false` (default): SessionManager emits `session.handoffPending` and
   * pauses — operator must confirm via Telegram/Web UI. This preserves the I-6
   * destructive-action gate: auto_handoff=true is pre-authorization via profile
   * config, not a bypass of the gate.
   *
   * I-6 Rationalization Counter: profile flag is the operator's explicit opt-in,
   * equivalent to a standing confirm. The gate still exists; it is satisfied at
   * profile-load time rather than interactively.
   */
  autoHandoff: z.boolean().default(false),

  /**
   * Milliseconds to wait for the SessionEnd hook to fire after writing the
   * graceful-end slash-command.
   *
   * If the hook does not fire within this window, SessionManager escalates to
   * SIGTERM (5 s wait) → SIGKILL. Defaults to 30 000 ms (30 s).
   */
  gracefulEndTimeoutMs: z.number().int().min(1000).default(30_000),

  // ── Worktree isolation (Phase 6.3) ────────────────────────────────────────

  /**
   * Phase 6.3: Per-session git worktree isolation (Decision 018).
   *
   * When true, ClaudeCodeAdapter.spawn() creates `.git/worktrees/orch-<sessionId>/`
   * with branch `<baseBranch>-orch-<sessionId>`; terminate() prunes both.
   * Default false preserves v2.0 single-working-tree behavior.
   *
   * I-12 adapter failure isolation: worktree errors are caught at adapter
   * boundary; daemon never shells out to git directly.
   */
  worktreeIsolation: z.boolean().default(false),

  /**
   * Phase 6.3: Base branch for ephemeral worktree branches (Decision 018).
   *
   * Only consulted when worktreeIsolation is true. Defaults to 'main'.
   */
  baseBranch: z.string().min(1).default('main'),

  /**
   * Slash-commands the daemon may write to the Claude Code subprocess stdin.
   *
   * YAML key: `commands:`
   * Example YAML:
   *   commands:
   *     sessionEnd: /session-end
   */
  commands: z
    .object({
      /**
       * Slash-command to trigger graceful session end from within Claude Code.
       *
       * When set (e.g. `/session-end`), SessionManager writes `<command>\n` to
       * the child process stdin on `session.forceHandoff`.
       * When absent, SessionManager skips the stdin write and waits for hook or timeout.
       */
      sessionEnd: z.string().optional(),
    })
    .default({}),

  // ── Cron scheduler (Task 3.7) ─────────────────────────────────────────────

  /**
   * Cron-driven plan enqueue map (Task 3.7).
   *
   * Keys are unique cron names within the project (URL-safe lowercase). Values
   * are five-field cron expressions (node-cron format: `m h dom mon dow`).
   * The cron NAME is also the plan filename stem: cron name `daily-signals`
   * enqueues the plan at `{rootPath}/session-plans/pending/daily-signals.md`.
   *
   * I-2: keys are operator-defined. No project-specific defaults.
   * I-10: malformed expressions are rejected at parse-time via refine().
   *
   * Example:
   *   cron:
   *     daily-signals: "0 9 * * *"
   *     hourly-watch:  "0 * * * *"
   */
  cron: z
    .record(
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]*$/, 'cron name must be lowercase URL-safe'),
      z
        .string()
        .min(1)
        .refine((expr) => cronValidate(expr), {
          message:
            'invalid cron expression (expected 5 fields: m h dom mon dow)',
        }),
    )
    .default({}),
});

/** TypeScript type inferred from ProfileSchema — the canonical Profile shape. */
export type Profile = z.infer<typeof ProfileSchema>;

// ── Parse helper ─────────────────────────────────────────────────────────────

/** Result type returned by parseProfile — discriminated union on `success`. */
export type ParseProfileResult = ReturnType<typeof ProfileSchema.safeParse>;

/**
 * Parse and validate raw YAML data against the ProfileSchema.
 *
 * Returns a `{ success: true, data: Profile }` or `{ success: false, error }` result
 * without throwing — callers convert failures to `ProfileValidationError` (I-12).
 */
export function parseProfile(raw: unknown): ParseProfileResult {
  return ProfileSchema.safeParse(raw);
}
