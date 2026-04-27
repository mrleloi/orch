/**
 * env/schema.ts — Zod schemas for environment variables used by Phase 2 packages.
 *
 * Each consumer (telegram, web) imports only the subset it needs.
 * Core daemon env vars remain in packages/core/src/config/env.schema.ts.
 *
 * I-10: all external env inputs validated with zod.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared across telegram + web (both call core HTTP API)
// ---------------------------------------------------------------------------

/** Schema for env vars shared across all Phase 2 consumer packages. */
export const sharedEnvSchema = z.object({
  /** Bearer token for authenticating against core daemon REST API. */
  ORCH_API_BEARER_TOKEN: z
    .string()
    .min(1, 'ORCH_API_BEARER_TOKEN must not be empty'),

  /** Base URL of the core daemon HTTP API. */
  ORCH_API_BASE_URL: z
    .string()
    .url()
    .default('http://127.0.0.1:4141'),
});

// ---------------------------------------------------------------------------
// Telegram-specific
// ---------------------------------------------------------------------------

/**
 * Schema for @orch/telegram environment variables.
 *
 * ORCH_TG_ALLOWED_CHAT_IDS: comma-separated numeric chat IDs.
 *   e.g. "123456789,987654321"
 *   Transformed to number[] for whitelist middleware.
 */
export const telegramEnvSchema = sharedEnvSchema.extend({
  TELEGRAM_BOT_TOKEN: z
    .string()
    .min(1, 'TELEGRAM_BOT_TOKEN must not be empty'),

  ORCH_TG_ALLOWED_CHAT_IDS: z
    .string()
    .min(1, 'ORCH_TG_ALLOWED_CHAT_IDS must not be empty')
    .superRefine((val, ctx) => {
      const parts = val.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      for (const s of parts) {
        const n = Number(s);
        if (!Number.isInteger(n) || n <= 0) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid chat ID: "${s}" — must be a positive integer`,
          });
        }
      }
    })
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => Number(s)),
    ),
});

export type TelegramEnv = z.infer<typeof telegramEnvSchema>;

/** Validate and parse telegram env vars. Throws on invalid input. */
export function validateTelegramEnv(
  config: Record<string, unknown>,
): TelegramEnv {
  const result = telegramEnvSchema.safeParse(config);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Telegram env validation failed:\n${messages}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Web-specific (Vite exposes these as import.meta.env.VITE_*)
// ---------------------------------------------------------------------------

/**
 * Schema for @orch/web build-time env vars.
 *
 * These are loaded at build time by Vite and must be prefixed VITE_.
 * At runtime they are read from import.meta.env.
 */
export const webEnvSchema = z.object({
  VITE_ORCH_API_BASE_URL: z
    .string()
    .url()
    .default('http://127.0.0.1:4141'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

// ---------------------------------------------------------------------------
// OTEL (used by core daemon; exported here for Phase 2 reference)
// ---------------------------------------------------------------------------

/** OTEL exporter endpoint env var schema (used in core; re-exported for reference). */
export const otelEnvSchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .default('http://127.0.0.1:4318'),
});

export type OtelEnv = z.infer<typeof otelEnvSchema>;
