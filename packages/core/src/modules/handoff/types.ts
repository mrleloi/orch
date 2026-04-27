/**
 * types.ts — DTOs, errors, injection tokens, and constants for the Handoff module.
 *
 * Rules enforced:
 *  I-1: Zero LLM API imports — pure TypeScript only.
 *  I-2: No project-specific names (no 'stockforge', etc.).
 *  I-12: Zero `any` — all fields are strongly typed.
 *
 * Token pattern follows the IAGENT_RUNTIME precedent from sessions/:
 *  - Symbol-based injection tokens (no NestJS framework import required).
 *  - Corresponding interface defined here; concrete impl lives in provider files.
 *
 * Why types live in modules/handoff (not domain/):
 *  These DTOs reference runtime concerns (OTEL trace IDs, ISO timestamps,
 *  endedReason from session state machine) that tie them to infrastructure.
 *  Per CLAUDE.md: "Domain layer has ZERO framework dependency." Keeping types
 *  here avoids coupling the domain/ layer to handoff-specific shapes.
 */

import { z } from 'zod';
import { DomainError } from '../../domain/errors.js';
import type { ITracer } from '../../domain/types/tracer.js';

export type { ITracer };

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hard token cap per phase plan L140 and Part A.6. */
export const HANDOFF_MAX_TOKENS = 5000;

/** ASCII 4-chars-per-token proxy — see A.6 rationale (no real tokenizer dep). */
export const HANDOFF_CHARS_PER_TOKEN = 4;

/** Effective char-based enforcement ceiling: 5000 * 4 = 20000. */
export const HANDOFF_MAX_CHARS = HANDOFF_MAX_TOKENS * HANDOFF_CHARS_PER_TOKEN;

// ── DI Injection Tokens ───────────────────────────────────────────────────────

/**
 * Injection token for IHandoffBuilder.
 * Wired in HandoffModule: { provide: IHANDOFF_BUILDER, useClass: HandoffContextBuilder }.
 */
export const IHANDOFF_BUILDER = Symbol('IHandoffBuilder');

/**
 * Injection token for the execa function boundary.
 * Hard-coded to accept only 'git' as the binary — see A.3 ExecaFn type alias.
 * Injected into GitDiffCollector for testability.
 */
export const EXECA_TOKEN = Symbol('ExecaFn');

/**
 * Injection token for the filesystem reader boundary.
 * Injected into SessionLogParser for testability.
 */
export const FS_TOKEN = Symbol('IFsReader');

/**
 * Injection token for the structured logger.
 * Follows the same pattern as SESSION_TERMINATOR / IAGENT_RUNTIME tokens.
 */
export const LOGGER_TOKEN = Symbol('ILogger');

/**
 * Injection token for the ITracer (OTEL span emitter) injected into HandoffContextBuilder.
 * Optional: if not provided, the builder skips span emission (test environments).
 * Concrete impl: TracingService (global from TracingModule).
 */
export const TRACER_TOKEN = Symbol('ITracer');

// ── DI Port Interfaces ────────────────────────────────────────────────────────

/**
 * Minimal structured logger port.
 * Concrete impl provided by HandoffModule via useFactory (wraps NestJS Logger).
 * I-14: This interface is pure TypeScript — no NestJS imports.
 */
export interface ILogger {
  log(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
}

/**
 * Filesystem reader port.
 * Wraps `fs.promises` for testability (SessionLogParser injects this token).
 * I-14: Pure TypeScript interface — no NestJS imports.
 */
export interface IFsReader {
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
  /** Returns file size in bytes; used for 256KB cap check. */
  stat(path: string): Promise<{ size: number }>;
}

/**
 * Type alias for the execa boundary injected into GitDiffCollector.
 * Binary parameter is narrowed to the literal 'git' to enforce decision 006
 * (no arbitrary subprocess execution from the handoff module).
 *
 * @see packages/core/src/modules/handoff/git-diff-collector.ts
 * @see agent-workspace/memory/decisions/006-handoff-no-llm.md §Enforcement
 */
export type ExecaFn = (
  binary: 'git',
  args: readonly string[],
  options: { cwd: string; timeout: number; reject: false },
) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
}>;

// ── L0 DTOs (GitDiffCollector output) ─────────────────────────────────────────

/** L0 file diff record. Pure data, no behavior. */
export interface FileDiffRecord {
  readonly path: string;
  readonly insertions: number;
  readonly deletions: number;
  /** True if `git diff` flagged the path as binary (no line counts). */
  readonly binary: boolean;
}

/** L0 summary returned by GitDiffCollector. */
export interface GitDiffSummary {
  readonly fromRef: string; // session-start commit SHA
  readonly toRef: string; // session-end HEAD SHA
  readonly files: readonly FileDiffRecord[];
  readonly totalInsertions: number;
  readonly totalDeletions: number;
  /** True if `git` could not run (e.g., not a repo). Render fallback expected. */
  readonly degraded: boolean;
  readonly degradedReason?: string;
}

// ── L1 DTOs (SessionLogParser output) ─────────────────────────────────────────

/** L1 task record extracted from session log. */
export interface SessionTaskRecord {
  readonly title: string;
  /** Verbatim list-item body after the leading bullet, trimmed. */
  readonly detail: string;
}

/** L1 decision record. */
export interface SessionDecisionRecord {
  readonly id?: string; // e.g., "001" if heading is "### Decision 001 — ..."
  readonly title: string;
  readonly detail: string;
}

/** L1 parsed session log. */
export interface SessionLogSummary {
  readonly filePath: string;
  readonly sessionDate?: string; // YYYY-MM-DD if parseable from filename
  readonly sessionNumber?: number; // N if filename matches /session-(\d+)/
  readonly completed: readonly SessionTaskRecord[];
  readonly pending: readonly SessionTaskRecord[];
  readonly decisions: readonly SessionDecisionRecord[];
  /** Verbatim text of the "Next Session Pickup" section, if present. */
  readonly nextSessionPickup: string | null;
  /** Diagnostic flags surfaced to renderer. */
  readonly missingSections: readonly (
    | 'completed'
    | 'pending'
    | 'decisions'
    | 'next_session_pickup'
  )[];
}

// ── Top-level DTO ─────────────────────────────────────────────────────────────

/** Top-level DTO assembled by HandoffContextBuilder. */
export interface HandoffContext {
  readonly sessionId: string;
  readonly projectId: string;
  readonly endedAt: string; // ISO-8601
  readonly endedReason:
    | 'CONTEXT_FULL'
    | 'CONTEXT_FULL_FORCED'
    | 'OPERATOR'
    | 'ERROR';
  readonly gitDiff: GitDiffSummary;
  readonly logSummary: SessionLogSummary | null; // null if log file absent
  readonly degraded: boolean;
  readonly degradedReasons: readonly string[];
}

// ── Renderer DTOs ─────────────────────────────────────────────────────────────

/** Renderer output. */
export interface RenderedPrompt {
  readonly text: string;
  /** Char-based proxy for tokens — see A.6. */
  readonly tokens: number;
  readonly truncated: boolean;
  readonly truncationActions: readonly TruncationAction[];
}

export type TruncationAction =
  | { kind: 'dropped_oldest_decisions'; count: number }
  | { kind: 'dropped_oldest_completed'; count: number }
  | { kind: 'dropped_diff_records'; count: number }
  | { kind: 'shortened_pickup'; charsRemoved: number }
  | { kind: 'hard_truncated'; charsRemoved: number };

// ── Builder I/O ───────────────────────────────────────────────────────────────

/** Input envelope for HandoffContextBuilder.build(). Validated with zod at build() entry (I-10). */
export interface HandoffBuildInput {
  readonly sessionId: string;
  readonly projectId: string;
  readonly repoPath: string;
  readonly sessionStartCommit: string; // SHA captured at session start
  readonly sessionEndCommit: string; // HEAD at session end (or HEAD~0)
  readonly sessionLogPath: string | null; // absolute path to YYYY-MM-DD-session-N.md
  readonly endedAt: string; // ISO
  readonly endedReason: HandoffContext['endedReason'];
}

/** Port interface for the builder — used via IHANDOFF_BUILDER injection token. */
export interface IHandoffBuilder {
  build(input: HandoffBuildInput): Promise<HandoffContext>;
  render(ctx: HandoffContext): RenderedPrompt;
}

// ── Domain Errors ─────────────────────────────────────────────────────────────

/** Discriminated code union for HandoffBuilderError. */
type HandoffBuilderErrorCode =
  | 'GIT_NOT_AVAILABLE'
  | 'GIT_BAD_REVISION'
  | 'LOG_READ_FAILED'
  | 'LOG_TOO_LARGE'
  | 'INVARIANT_VIOLATED'
  | 'VALIDATION_FAILED';

/**
 * Handoff-specific domain error.
 * Extends DomainError (coding-principles §Error Handling) so callers can use
 * `instanceof DomainError` uniformly across the daemon.
 *
 * 3.5.a carryforward: changed from `extends Error` to `extends DomainError`
 * to match the pattern in domain/errors.ts.
 */
export class HandoffBuilderError extends DomainError {
  readonly code: HandoffBuilderErrorCode;

  constructor(code: HandoffBuilderErrorCode, message: string, cause?: unknown) {
    super(code, message, { cause });
    this.name = 'HandoffBuilderError';
    // DomainError sets this.code to the first arg; we shadow it with a narrower type.
    this.code = code;
  }
}

// ── Zod validation schema (I-10) ──────────────────────────────────────────────

/**
 * Zod schema for HandoffBuildInput (I-10 validation at build() entry).
 * Co-located with the DTO for grep-ability.
 */
export const HandoffBuildInputSchema = z.object({
  sessionId: z.string().min(1, 'sessionId must be non-empty'),
  projectId: z.string().min(1, 'projectId must be non-empty'),
  repoPath: z.string().min(1, 'repoPath must be non-empty'),
  sessionStartCommit: z.string().min(1, 'sessionStartCommit must be non-empty'),
  sessionEndCommit: z.string().min(1, 'sessionEndCommit must be non-empty'),
  sessionLogPath: z.string().nullable(),
  endedAt: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      'endedAt must be an ISO-8601 datetime string',
    ),
  endedReason: z.enum([
    'CONTEXT_FULL',
    'CONTEXT_FULL_FORCED',
    'OPERATOR',
    'ERROR',
  ]),
});
