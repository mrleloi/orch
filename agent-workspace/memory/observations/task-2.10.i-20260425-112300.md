# Task 2.10.i — P2002 unique-constraint helper

## Status
DONE

## Files Changed
- packages/core/src/domain/errors.ts: added DuplicateRecordError class (lines ~321-342)
- packages/core/src/domain/prisma-error-helper.ts: created (new file, 38 lines)
- packages/core/src/modules/hooks/hooks.service.ts: wrapped tx.hookEvent.create in try/catch with handlePrismaError
- packages/core/src/modules/audit/operator-action-log.service.ts: extended catch block with P2002 branch
- packages/core/src/domain/prisma-error-helper.spec.ts: created (new file, 2 tests)
- packages/core/src/modules/hooks/hooks.service.spec.ts: added 1 test (P2002 race dedup)
- packages/core/src/modules/audit/operator-action-log.service.spec.ts: added 1 test (P2002 suppress)

## Tests Added
- packages/core/src/domain/prisma-error-helper.spec.ts: 2 cases
- packages/core/src/modules/hooks/hooks.service.spec.ts: +1 case (total now 19)
- packages/core/src/modules/audit/operator-action-log.service.spec.ts: +1 case (total now 7)

## Gates
- typecheck: PASS
- lint: PASS (auto-fixed style only)
- test prisma-error-helper: PASS (2/2)
- test hooks.service: PASS (19/19)
- test operator-action-log: PASS (7/7)
- invariants domain_no_nestjs: PASS (no import statements)
- invariants domain_no_prisma_client: PASS (no import statements)
- full_core_test: PASS (753/753)

## Deviations from Plan
- hooks.service.spec.ts P2002 test uses a manually constructed customTx/customPrisma rather
  than patching the existing buildFakePrisma() helper, because buildFakePrisma() doesn't return
  the tx object in a way that allows overriding hookEvent.create after construction. The test
  outcome is equivalent.

## Concerns
None.

## Assumptions Made
- TxResult.deduped: boolean already covers `{ deduped: true }` — no type widening needed (confirmed by reading TxResult definition).
- The `satisfies TxResult` pattern on the deduped path is consistent with existing usage in the service.
- Structural P2002 check (no @prisma/client import) is correct per spec Part C and I-14.
