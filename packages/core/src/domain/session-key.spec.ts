/**
 * Unit tests for sessionKey factory.
 *
 * The key contract: same inputs always produce the same key (determinism), and
 * different inputs always produce different keys (no collisions within sane values).
 */

import { sessionKey } from './session-key';

describe('sessionKey', () => {
  describe('determinism', () => {
    it('produces the same key for identical inputs', () => {
      const k1 = sessionKey('proj-a', 'impl', 'main');
      const k2 = sessionKey('proj-a', 'impl', 'main');
      expect(k1).toBe(k2);
    });

    it('produces the same key when threadId defaults to main', () => {
      const withDefault = sessionKey('proj-a', 'impl');
      const explicit = sessionKey('proj-a', 'impl', 'main');
      expect(withDefault).toBe(explicit);
    });
  });

  describe('format', () => {
    it('joins parts with colons', () => {
      expect(sessionKey('my-project', 'review', 'thread-1')).toBe(
        'my-project:review:thread-1',
      );
    });

    it('uses "main" as the default threadId', () => {
      expect(sessionKey('p', 'review')).toBe('p:review:main');
    });
  });

  describe('uniqueness', () => {
    it('differs when projectId differs', () => {
      expect(sessionKey('proj-a', 'impl')).not.toBe(sessionKey('proj-b', 'impl'));
    });

    it('differs when sessionType differs', () => {
      expect(sessionKey('proj-a', 'impl')).not.toBe(
        sessionKey('proj-a', 'review'),
      );
    });

    it('differs when threadId differs', () => {
      expect(sessionKey('proj-a', 'impl', 'thread-1')).not.toBe(
        sessionKey('proj-a', 'impl', 'thread-2'),
      );
    });
  });

  describe('input validation', () => {
    it('throws on empty projectId', () => {
      expect(() => sessionKey('', 'impl')).toThrow(/projectId/i);
    });

    it('throws on empty sessionType', () => {
      expect(() => sessionKey('proj-a', '')).toThrow(/sessionType/i);
    });

    it('throws on explicitly empty threadId', () => {
      expect(() => sessionKey('proj-a', 'impl', '')).toThrow(/threadId/i);
    });
  });
});
