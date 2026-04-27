/**
 * Shared helper for converting Prisma errors into typed DomainErrors.
 *
 * Lives in domain/ — pure TypeScript, no @prisma/client import (I-14).
 * Uses structural shape checks only.
 */

import { DomainError, DuplicateRecordError } from './errors.js';

interface PrismaP2002Like {
  code: string;
  meta?: { modelName?: string; target?: readonly string[] };
}

function isPrismaP2002(err: unknown): err is PrismaP2002Like {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Convert a Prisma error into a DomainError.
 * Returns `DuplicateRecordError` for P2002 unique-constraint violations.
 * Wraps everything else as a generic `PRISMA_ERROR`.
 *
 * **Error code note**: This function matches the Prisma-specific error code
 * `'P2002'` (unique constraint violation). It does NOT match the raw SQL
 * `SQLSTATE '23505'` (PostgreSQL/SQLite unique-violation) by design — all
 * database access today goes through Prisma, which always surfaces `P2002`.
 *
 * @todo If a raw database driver (e.g. `better-sqlite3` direct, `pg`, or any
 *   driver that bypasses the Prisma query engine) is introduced, extend this
 *   helper to also detect SQLSTATE `'23505'` (PostgreSQL / SQLite) and the
 *   MySQL equivalent `'23000'` (ER_DUP_ENTRY). Until then, raw-driver errors
 *   fall through to the generic `PRISMA_ERROR` branch.
 */
export function handlePrismaError(err: unknown): DomainError {
  if (isPrismaP2002(err)) {
    return new DuplicateRecordError(
      err.meta?.modelName ?? 'unknown',
      err.meta?.target ?? [],
      { cause: err },
    );
  }
  return new DomainError('PRISMA_ERROR', String(err), { cause: err });
}
