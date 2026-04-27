# Task 4.6 — 2026-04-26

## Goal
Populate `examples/stockforge-integration/` and `examples/generic-nodejs-project/` with copy-paste reference integration files (profile.yaml, settings.json hook snippet, README.md) and add two tests: an attach round-trip test for the generic example and a schema-parse test for the stockforge profile.yaml.

## Session Type
FOCUSED_IMPL

## Approach
Read existing files first before writing anything. Discovered that `stockforge-integration/` already had `profile.yaml`, `hooks-snippet.json`, and `README.md` from earlier work. Inspected all three — profile.yaml is in domain ProfileSchema format (correct), hooks-snippet.json uses legacy curl commands (kept as-is per the "don't overwrite blindly" rule). Created `settings.json` alongside hooks-snippet.json using the canonical Task 4.5 orch-receiver.sh pattern. Added I-2 exception notice to the existing README.

For `generic-nodejs-project/`, created all three files from scratch using the domain ProfileSchema field names and the four canonical orch-receiver.sh hooks.

For tests, inlined a ProfileSchema mirror in the test file (not importing from core) to avoid cross-package dev dependencies. Fixed a Windows-specific URL path resolution bug (`/C:/` -> `C:/`) on the first attempt.

## Accomplished
- Subtask 1 (stockforge-integration): Added `settings.json` (4 canonical orch-receiver.sh hooks). Added I-2 documented exception block to `README.md`. Updated Step 3 to describe both `settings.json` and `hooks-snippet.json`. `profile.yaml` and `hooks-snippet.json` kept unchanged.
- Subtask 2 (generic-nodejs-project): Created `profile.yaml`, `settings.json`, `README.md`.
- Subtask 3 (tests): Created `packages/cli/src/commands/examples.spec.ts` with 2 tests:
  - `runAttachFlow --no-interactive writes .orch/profile.yaml to the target directory` (attach round-trip)
  - `parses through ProfileSchema without errors (I-2: stockforge is fixture data only)` (schema parse)
- Removed `.gitkeep` from both example directories (now have real content).

## Gates Status
- Typecheck: PASS
- Lint: PASS (pre-existing web-ui warnings, 0 errors)
- Tests: PASS (1372/1372; +2 new in CLI)
- Invariants: I-2 PASS (grep stockforge packages/core/src/ = only comments/docs, no production code)

## Files Modified
- `examples/stockforge-integration/README.md` — added I-2 exception notice, updated Step 3 hook instructions
- `examples/stockforge-integration/settings.json` — new: 4 canonical hooks (orch-receiver.sh)
- `examples/stockforge-integration/.gitkeep` — removed
- `examples/generic-nodejs-project/profile.yaml` — new: domain ProfileSchema format
- `examples/generic-nodejs-project/settings.json` — new: 4 canonical hooks (orch-receiver.sh)
- `examples/generic-nodejs-project/README.md` — new: 3-step walkthrough
- `examples/generic-nodejs-project/.gitkeep` — removed
- `packages/cli/src/commands/examples.spec.ts` — new: 2 tests (attach round-trip + schema parse)

## Decisions Made
- Kept `hooks-snippet.json` unchanged (legacy curl pattern; documented the difference in README Step 3).
- Inlined ProfileSchema in the test file rather than importing from core to avoid cross-package dev dependency.
- Used `z.string().min(1)` for cron values in the inlined schema (no node-cron in CLI package) — sufficient for YAML parse validation.

## Next Session Pickup
Task 4.7 (CI Setup — GitHub Actions workflows). Both `examples/` directories are now complete. Test count is 1,372 (at target).
