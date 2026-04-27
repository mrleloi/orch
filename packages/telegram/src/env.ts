/**
 * env.ts — Environment variable validation for @orch/telegram.
 *
 * Re-exports the shared telegramEnvSchema and adds the validateTelegramEnv
 * function for use at process startup.
 *
 * I-10: all env vars validated with zod before use.
 * I-2: no hardcoded project names or paths.
 */

export { validateTelegramEnv } from '@orch/shared';
export type { TelegramEnv } from '@orch/shared';
