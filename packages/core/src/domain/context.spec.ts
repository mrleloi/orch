/**
 * Unit tests for OrchContext DI container.
 *
 * Tests run with NODE_ENV=test (jest default) so re-init and reset are allowed.
 */

import {
  initOrchContext,
  getOrchContext,
  hasOrchContext,
  resetOrchContextForTest,
  type OrchContext,
} from './context';

// Minimal stubs satisfying the OrchContext shape — real impls live in NestJS modules.
function makeCtx(tag = 'default'): OrchContext {
  return {
    store: { tag } as unknown as OrchContext['store'],
    runtime: { tag } as unknown as OrchContext['runtime'],
    notifier: { tag } as unknown as OrchContext['notifier'],
    tracer: { tag } as unknown as OrchContext['tracer'],
  };
}

describe('OrchContext', () => {
  // Guarantee a clean slate before each test.
  beforeEach(() => {
    resetOrchContextForTest();
  });

  afterEach(() => {
    resetOrchContextForTest();
  });

  describe('initOrchContext / getOrchContext roundtrip', () => {
    it('stores the context and returns it via getOrchContext', () => {
      const ctx = makeCtx('alpha');
      initOrchContext(ctx);
      expect(getOrchContext()).toBe(ctx);
    });
  });

  describe('getOrchContext', () => {
    it('throws if called before initOrchContext', () => {
      expect(() => getOrchContext()).toThrow(/not initialized/i);
    });
  });

  describe('hasOrchContext', () => {
    it('returns false before init', () => {
      expect(hasOrchContext()).toBe(false);
    });

    it('returns true after init', () => {
      initOrchContext(makeCtx());
      expect(hasOrchContext()).toBe(true);
    });

    it('returns false after resetOrchContextForTest', () => {
      initOrchContext(makeCtx());
      resetOrchContextForTest();
      expect(hasOrchContext()).toBe(false);
    });
  });

  describe('double-init', () => {
    it('throws on double-init when NODE_ENV is not test', () => {
      const original = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      try {
        initOrchContext(makeCtx('first'));
        expect(() => initOrchContext(makeCtx('second'))).toThrow(
          /already initialized/i,
        );
      } finally {
        // Restore env and reset state so afterEach can clean up without blowing up.
        process.env['NODE_ENV'] = original;
        // Force-clear the production-init so afterEach resetOrchContextForTest() works.
        process.env['NODE_ENV'] = 'test';
        resetOrchContextForTest();
        process.env['NODE_ENV'] = original;
      }
    });

    it('allows re-init in NODE_ENV=test (mock replacement)', () => {
      // NODE_ENV is 'test' by jest convention.
      initOrchContext(makeCtx('first'));
      const second = makeCtx('second');
      expect(() => initOrchContext(second)).not.toThrow();
      expect(getOrchContext()).toBe(second);
    });
  });

  describe('resetOrchContextForTest', () => {
    it('throws when NODE_ENV is not test', () => {
      const original = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';
      try {
        expect(() => resetOrchContextForTest()).toThrow(/NODE_ENV=test/i);
      } finally {
        process.env['NODE_ENV'] = original;
      }
    });

    it('allows getOrchContext to throw again after reset', () => {
      initOrchContext(makeCtx());
      resetOrchContextForTest();
      expect(() => getOrchContext()).toThrow(/not initialized/i);
    });
  });
});
