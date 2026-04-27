/**
 * sse-url.spec.ts — Unit tests for buildSseStreamUrl helper.
 *
 * 3 tests covering the percent-encoding contract.
 */

import { describe, it, expect } from 'vitest';
import { buildSseStreamUrl } from './sse-url.js';

describe('buildSseStreamUrl', () => {
  it('encodes a plain token into the query param', () => {
    const url = buildSseStreamUrl('my-token-123');
    expect(url).toBe('/api/v1/events/stream?token=my-token-123');
  });

  it('percent-encodes special characters (&, =, space)', () => {
    const url = buildSseStreamUrl('a b&c=d');
    expect(url).toBe('/api/v1/events/stream?token=a%20b%26c%3Dd');
  });

  it('handles empty string token without throwing', () => {
    const url = buildSseStreamUrl('');
    expect(url).toBe('/api/v1/events/stream?token=');
  });
});
