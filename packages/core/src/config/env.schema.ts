/**
 * env.schema.ts — Zod validation for Orch daemon environment variables.
 *
 * Used as ConfigModule.forRoot({ validate }) to enforce required env at startup.
 * I-10: all external inputs (including env) validated with zod.
 *
 * Required:
 *   ORCH_HOOK_SECRET       — shared secret for /hooks/* auth (X-Orch-Hook-Secret)
 *   ORCH_API_BEARER_TOKEN  — Bearer token for /api/v1/* auth
 *
 * Optional with defaults:
 *   ORCH_HTTP_PORT         — HTTP listen port (default 4141)
 *   ORCH_HTTP_HOST         — HTTP listen host (default 127.0.0.1)
 *   ORCH_HOME              — daemon home directory (default ~/.orch)
 *   ORCH_LOG_LEVEL         — pino log level (default info)
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP HTTP endpoint (optional)
 *   ORCH_TRACE_BACKEND     — trace backend selector: 'otlp' | 'langfuse' | 'none' (default 'otlp')
 *   LANGFUSE_OTLP_ENDPOINT — Langfuse OTLP ingest URL (required when ORCH_TRACE_BACKEND=langfuse)
 *   LANGFUSE_PUBLIC_KEY    — Langfuse project public key (required when ORCH_TRACE_BACKEND=langfuse)
 *   LANGFUSE_SECRET_KEY    — Langfuse project secret key (required when ORCH_TRACE_BACKEND=langfuse)
 *
 * I-10: Langfuse keys are required ONLY when backend=langfuse — enforced via
 * zod superRefine so the constraint lives in the schema, not in runtime code.
 */

import { z } from 'zod';

const baseEnvSchema = z.object({
  // Required secrets — non-empty strings
  ORCH_HOOK_SECRET: z.string().min(1, 'ORCH_HOOK_SECRET must not be empty'),
  ORCH_API_BEARER_TOKEN: z
    .string()
    .min(1, 'ORCH_API_BEARER_TOKEN must not be empty'),

  // HTTP bind
  ORCH_HTTP_PORT: z.coerce.number().int().positive().default(4141),
  ORCH_HTTP_HOST: z.string().default('127.0.0.1'),

  // Daemon home
  ORCH_HOME: z.string().default('~/.orch'),

  // Logging
  ORCH_LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  // OTEL exporter (optional — warn-only on connect failure)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

  // Trace backend UI URL — used by Web UI to build trace deep links (charter F6, Task 3.8).
  // Default: empty string (trace deep links disabled).
  ORCH_TRACE_BACKEND_UI_URL: z.string().default(''),

  // Trace backend selector — Task 3.9 (decisions/005-trace-backend-toggle.md).
  //   otlp (default): OTLP HTTP exporter to OTEL_EXPORTER_OTLP_ENDPOINT (Grafana LGTM).
  //   langfuse: OTLP exporter with Langfuse endpoint + Basic auth header.
  //   none: no exporter; in-process SpanProcessors (ContextBudgetSpanProcessor) still run.
  ORCH_TRACE_BACKEND: z.enum(['otlp', 'langfuse', 'none']).default('otlp'),

  // Langfuse OTLP credentials — optional individually; required as a group
  // when ORCH_TRACE_BACKEND=langfuse (enforced by superRefine below, not runtime code).
  LANGFUSE_OTLP_ENDPOINT: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
});

/**
 * Full env schema with cross-field refinement.
 *
 * I-10: when ORCH_TRACE_BACKEND=langfuse, all three Langfuse vars are required.
 * The refinement is part of the schema — no separate runtime guard needed.
 */
export const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.ORCH_TRACE_BACKEND === 'langfuse') {
    if (!data.LANGFUSE_OTLP_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LANGFUSE_OTLP_ENDPOINT'],
        message:
          'LANGFUSE_OTLP_ENDPOINT is required when ORCH_TRACE_BACKEND=langfuse',
      });
    }
    if (!data.LANGFUSE_PUBLIC_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LANGFUSE_PUBLIC_KEY'],
        message:
          'LANGFUSE_PUBLIC_KEY is required when ORCH_TRACE_BACKEND=langfuse',
      });
    }
    if (!data.LANGFUSE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LANGFUSE_SECRET_KEY'],
        message:
          'LANGFUSE_SECRET_KEY is required when ORCH_TRACE_BACKEND=langfuse',
      });
    }
  }
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validator function passed to ConfigModule.forRoot({ validate }).
 * Throws ZodError (converted to string) on invalid env — NestJS surfaces it at startup.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${messages}`);
  }
  return result.data;
}
