/**
 * secret-redactor.spec.ts
 *
 * Coverage:
 * - ≥12 positive fixtures (one per pattern category)
 * - ≥3 negative controls
 * - Idempotency
 * - Multi-secret on one line
 * - Performance sanity (100KB input in < 100ms)
 */

import { redactSecrets, SECRET_PATTERNS } from './secret-redactor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasNoRedacted(s: string): boolean {
  return !s.includes('[REDACTED]');
}

function isFullyRedacted(s: string, original: string): boolean {
  return s.includes('[REDACTED]') && s !== original;
}

// ---------------------------------------------------------------------------
// Positive fixtures — each must produce [REDACTED] output
// ---------------------------------------------------------------------------

describe('redactSecrets — positive fixtures', () => {
  // 1. Anthropic API key
  it('redacts Anthropic sk-ant- key', () => {
    const input = 'key: sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv';
    const result = redactSecrets(input);
    expect(result).not.toContain('sk-ant-api03');
    expect(result).toContain('[REDACTED]');
  });

  // 2. OpenAI-style key (sk- without ant-)
  it('redacts OpenAI-style sk- key', () => {
    const input = 'OPENAI_KEY=sk-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh';
    const result = redactSecrets(input);
    // The .env pattern runs first, value gets redacted
    expect(result).not.toContain('sk-ABCDEFGHIJK');
    expect(result).toContain('[REDACTED]');
  });

  // 3. Bearer token
  it('redacts Bearer token', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig==';
    const result = redactSecrets(input);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).toContain('[REDACTED]');
  });

  // 4. GitHub personal access token (ghp_)
  it('redacts GitHub PAT ghp_', () => {
    const input = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ab';
    const result = redactSecrets(input);
    expect(result).not.toContain('ghp_');
    expect(result).toContain('[REDACTED]');
  });

  // 5. GitHub OAuth token (gho_)
  it('redacts GitHub OAuth token gho_', () => {
    const input = 'Authorization: Bearer gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789012';
    const result = redactSecrets(input);
    expect(result).not.toContain('gho_');
    expect(result).toContain('[REDACTED]');
  });

  // 6. GitHub server-to-server token (ghs_)
  it('redacts GitHub server-to-server token ghs_', () => {
    const input = 'ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcd';
    const result = redactSecrets(input);
    expect(result).not.toContain('ghs_');
    expect(result).toContain('[REDACTED]');
  });

  // 7. AWS Access Key ID
  it('redacts AWS Access Key ID AKIA...', () => {
    const input = 'aws_access_key_id = AKIAIOSFODNN7EXAMPLE';
    const result = redactSecrets(input);
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result).toContain('[REDACTED]');
  });

  // 8. AWS Secret Access Key (context-dependent pattern)
  it('redacts AWS secret access key', () => {
    const input = 'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const result = redactSecrets(input);
    // Either the .env pattern or the AWS pattern catches this
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
  });

  // 9. .env-style line — keeps key, redacts value
  it('redacts .env line value but preserves key name', () => {
    const input = 'DATABASE_URL=postgres://user:password@localhost:5432/mydb';
    const result = redactSecrets(input);
    expect(result).toContain('DATABASE_URL=[REDACTED]');
    expect(result).not.toContain('postgres://user:password');
  });

  // 10. Generic 40+ char lowercase hex (e.g., git commit SHA or session token)
  it('redacts generic long hex string (40 chars)', () => {
    const input = 'commit: da39a3ee5e6b4b0d3255bfef95601890afd80709';
    const result = redactSecrets(input);
    expect(result).not.toContain('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(result).toContain('[REDACTED]');
  });

  // 11. GitHub refresh token (ghr_)
  it('redacts GitHub refresh token ghr_', () => {
    const input = 'refresh_token=ghr_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef';
    const result = redactSecrets(input);
    expect(result).not.toContain('ghr_');
    expect(result).toContain('[REDACTED]');
  });

  // 12. Multiple .env lines in block
  it('redacts multiple .env lines preserving keys', () => {
    const input = [
      'API_KEY=sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
      'DB_PASSWORD=supersecretpassword123',
      'PLAIN_TEXT=hello world',
    ].join('\n');
    const result = redactSecrets(input);
    expect(result).toContain('API_KEY=[REDACTED]');
    expect(result).toContain('DB_PASSWORD=[REDACTED]');
    expect(result).toContain('PLAIN_TEXT=[REDACTED]');
    expect(result).not.toContain('supersecretpassword123');
  });
});

// ---------------------------------------------------------------------------
// Negative controls — must NOT produce [REDACTED]
// ---------------------------------------------------------------------------

describe('redactSecrets — negative controls', () => {
  // N1: Plain prose, no secrets
  it('does not redact plain prose', () => {
    const input =
      'Hello, this is a normal message with no secrets. The quick brown fox jumps over the lazy dog.';
    const result = redactSecrets(input);
    expect(result).toBe(input);
    expect(hasNoRedacted(result)).toBe(true);
  });

  // N2: Short UUID-ish string well below 32-char threshold for sk- pattern
  it('does not redact short token under threshold', () => {
    const input = 'user-id: abc123def456ghi7';
    const result = redactSecrets(input);
    expect(result).toBe(input);
    expect(hasNoRedacted(result)).toBe(true);
  });

  // N3: sk_ (underscore, not dash) should NOT match sk- pattern
  it('does not redact sk_ (underscore) prefixed token', () => {
    const input = 'stripe_key=sk_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    // Note: sk_ uses underscore, our pattern matches sk- (dash). However
    // the .env pattern WILL redact the value since it's a .env-style line.
    // So we test that the raw token itself (if standalone) is not matched.
    const standalone = 'sk_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
    const result = redactSecrets(standalone);
    // sk_ does not match sk- or sk-ant- pattern; no .env pattern (no KEY= prefix)
    expect(result).toBe(standalone);
    expect(hasNoRedacted(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('redactSecrets — idempotency', () => {
  it('is idempotent: redact(redact(x)) === redact(x)', () => {
    const inputs = [
      'sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      'API_KEY=my_super_secret_key_that_is_very_long_indeed',
      'da39a3ee5e6b4b0d3255bfef95601890afd80709',
      'Hello plain world',
    ];
    for (const input of inputs) {
      const once = redactSecrets(input);
      const twice = redactSecrets(once);
      expect(twice).toBe(once);
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-secret on one line
// ---------------------------------------------------------------------------

describe('redactSecrets — multi-secret line', () => {
  it('redacts all secrets on a single line', () => {
    const input =
      'key1=sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig together';
    const result = redactSecrets(input);
    expect(result).not.toContain('sk-ant-api03');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).toContain('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Performance sanity
// ---------------------------------------------------------------------------

describe('redactSecrets — performance', () => {
  it('processes 100KB input in < 100ms', () => {
    // Build a 100KB string of benign text (no secrets to avoid skewing with match cost)
    const chunk =
      'The quick brown fox jumps over the lazy dog. No secrets here. '.repeat(100);
    const input = chunk.repeat(Math.ceil((100 * 1024) / chunk.length)).slice(0, 100 * 1024);

    const start = performance.now();
    redactSecrets(input);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('processes 100KB input with many secrets in < 100ms', () => {
    // Mix of real-looking secrets scattered through text
    const secretLine = 'API_KEY=sk-ant-api03-ABCDEFGHIJ1234567890abcdefghijklmnopqrstuv\n';
    const plainLine = 'The quick brown fox jumps over the lazy dog.\n';
    // ~50/50 mix
    const block = secretLine + plainLine;
    const input = block.repeat(Math.ceil((100 * 1024) / block.length)).slice(0, 100 * 1024);

    const start = performance.now();
    redactSecrets(input);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// SECRET_PATTERNS export — basic structural check
// ---------------------------------------------------------------------------

describe('SECRET_PATTERNS export', () => {
  it('is a readonly array of RegExp instances', () => {
    expect(Array.isArray(SECRET_PATTERNS)).toBe(true);
    expect(SECRET_PATTERNS.length).toBeGreaterThan(0);
    for (const p of SECRET_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp);
    }
  });
});
