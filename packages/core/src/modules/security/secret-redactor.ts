/**
 * secret-redactor.ts — Pure function for redacting secrets from strings.
 *
 * No NestJS imports (I-14). Framework-agnostic: use directly or via SecretRedactorService.
 *
 * Patterns ported from claude-code-telegram/src/claude/orchestrator.py lines 52-80.
 */

/**
 * Ordered list of [pattern, replacementLabel] tuples.
 * Each pattern is tested in order; matches are replaced with [REDACTED].
 *
 * Exported for testability and reuse.
 */
export const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  // Anthropic API keys: sk-ant-api03-...
  /sk-ant-[A-Za-z0-9\-_]{40,}/g,

  // OpenAI-style keys: sk-<32+ alphanum> (must NOT start with sk-ant-)
  // Negative lookahead prevents double-matching Anthropic keys
  /sk-(?!ant-)[A-Za-z0-9]{32,}/g,

  // Bearer tokens in Authorization headers
  /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/g,

  // GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_
  /gh[pousr]_[A-Za-z0-9]{36,}/g,

  // AWS Access Key IDs: AKIA followed by 16 uppercase alphanum
  /AKIA[0-9A-Z]{16}/g,

  // AWS Secret Access Keys (context-dependent, broad match)
  /(?:aws|AWS).{0,20}?["']?[0-9a-zA-Z/+]{40}["']?/g,

  // .env-style KEY=VALUE lines — keep key, redact value
  // Replaced separately in redactSecrets() to preserve key name
  /^([A-Z_][A-Z0-9_]*)\s*=\s*([^\n]+)$/gim,

  // Generic long lowercase hex strings (git SHAs, session tokens, etc.)
  /\b[a-f0-9]{40,}\b/g,
]);

/**
 * Individual patterns for the .env line redaction (keeps key, redacts value).
 * Applied with a capture-group replacement, not a simple [REDACTED] swap.
 */
const ENV_LINE_PATTERN = /^([A-Z_][A-Z0-9_]*)\s*=\s*([^\n]+)$/gim;

/**
 * All non-.env patterns — replace match entirely with [REDACTED].
 */
const SIMPLE_PATTERNS: readonly RegExp[] = Object.freeze([
  /sk-ant-[A-Za-z0-9\-_]{40,}/g,
  /sk-(?!ant-)[A-Za-z0-9]{32,}/g,
  /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(?:aws|AWS).{0,20}?["']?[0-9a-zA-Z/+]{40}["']?/g,
  /\b[a-f0-9]{40,}\b/g,
]);

/**
 * Redact secrets from `input`.
 *
 * - .env-style lines: `KEY=VALUE` → `KEY=[REDACTED]`
 * - All other patterns: match → `[REDACTED]`
 * - Idempotent: `redactSecrets(redactSecrets(x)) === redactSecrets(x)`
 * - Never throws; coerces non-string input via `String()`.
 */
export function redactSecrets(input: string): string {
  // I-12: coerce non-string at runtime (TypeScript prevents at compile time)
  let result = typeof input === 'string' ? input : String(input);

  // Pass 1: .env-style lines (keep key, redact value)
  result = result.replace(ENV_LINE_PATTERN, '$1=[REDACTED]');

  // Pass 2: all remaining simple-replace patterns
  for (const pattern of SIMPLE_PATTERNS) {
    // Reset lastIndex before each use (patterns have /g flag)
    pattern.lastIndex = 0;
    result = result.replace(pattern, '[REDACTED]');
  }

  return result;
}
