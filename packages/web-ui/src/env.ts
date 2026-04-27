/**
 * env.ts — Typed access to Vite build-time environment variables.
 *
 * Vite exposes VITE_* env vars via `import.meta.env`. This module wraps them
 * in a typed object, applying defaults where needed.
 *
 * I-10: env vars are validated at module load time; missing vars fail fast.
 * I-4: this file does NOT import @orch/core — it reads env only.
 */

/** Typed environment variables available in @orch/web. */
export interface WebEnv {
  /** Base URL of the Orch core daemon API. */
  orchApiBaseUrl: string;
}

/** Read and validate Vite env vars. Throws if required vars are missing. */
function loadEnv(): WebEnv {
  // VITE_ORCH_API_BASE_URL: optional, defaults to localhost core daemon
  const orchApiBaseUrl =
    import.meta.env['VITE_ORCH_API_BASE_URL'] ?? 'http://127.0.0.1:4141';

  if (typeof orchApiBaseUrl !== 'string' || orchApiBaseUrl.length === 0) {
    throw new Error('[orch/web] VITE_ORCH_API_BASE_URL must be a non-empty string');
  }

  return { orchApiBaseUrl };
}

/** Validated env vars — loaded once at module init. */
export const env: WebEnv = loadEnv();
