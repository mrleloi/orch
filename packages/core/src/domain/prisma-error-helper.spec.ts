/**
 * Unit tests for handlePrismaError helper.
 */

import { handlePrismaError } from './prisma-error-helper.js';
import { DuplicateRecordError, DomainError } from './errors.js';

describe('handlePrismaError', () => {
  it('P2002 returns DuplicateRecordError with model + target', () => {
    const fakeErr = {
      code: 'P2002',
      meta: { modelName: 'HookEvent', target: ['dedupKey'] },
    };

    const result = handlePrismaError(fakeErr);

    expect(result).toBeInstanceOf(DuplicateRecordError);
    const dup = result as DuplicateRecordError;
    expect(dup.code).toBe('DUPLICATE_RECORD');
    expect(dup.model).toBe('HookEvent');
    expect(dup.target).toEqual(['dedupKey']);
    expect(dup.retryable).toBe(false);
  });

  it('generic Error is wrapped as PRISMA_ERROR DomainError', () => {
    const genericErr = new Error('connection refused');

    const result = handlePrismaError(genericErr);

    expect(result).toBeInstanceOf(DomainError);
    expect(result).not.toBeInstanceOf(DuplicateRecordError);
    expect(result.code).toBe('PRISMA_ERROR');
    expect(result.cause).toBe(genericErr);
  });
});
