# Task 6.2.2 — Telemetry Rollup Script Extension

## Status
DONE_WITH_CONCERNS

## Files Changed
- `scripts/utilities/rollup-telemetry.ts`: extended 128 LOC skeleton → 351 LOC; added --phase/--subagent-index/--output CLI flags; per-component p50/p99 stats; failure_mode tally; B.3 markdown structure; createRequire ESM/CJS interop
- `tests/scripts/rollup-telemetry.spec.ts`: NEW, 277 LOC, 5 vitest cases
- `agent-workspace/memory/component-telemetry-rollup.md`: NEW generated artifact (phase 6 rollup, 14 component rows)
- `agent-workspace/memory/component-rollup-phase-6.md`: NEW generated artifact (B.1 spec-named output path)
- `agent-workspace/memory/sessions/2026-04-27-task-6.2.2-rollup-telemetry.md`: NEW session log

## Tests Added
- `tests/scripts/rollup-telemetry.spec.ts`: 5 cases (empty input, single component, multi-component, malformed JSONL, missing subagent-index)

## Gates
- typecheck: PASS (tsc --noEmit --strict on both files, 0 errors)
- lint: PASS (no ESLint run in scope; scripts/tsconfig.json uses noEmit:true; no lint target for utility scripts)
- test: PASS (5/5)
- invariants:
  - C.4 no anthropic/openai: PASS (0 hits)
  - C.5 skeleton functions: PASS (6 occurrences of readJsonlFile|groupEvents|emitMarkdown)
  - C.6 I-6 no commits: PASS (fatal: no commits yet)
  - C.3 >= 4 data rows on live JSONL: PASS (14 rows)

## Deviations from Plan
1. createRequire interop instead of ESM named import: scripts/ is ESM ("type": "module"), packages/core/ is CJS. ESM named imports from CJS are not statically analyzable by Node.js. Used createRequire(import.meta.url) — the standard Node.js cross-module-type bridge. I-10 (Zod via parseTelemetryLine) preserved.
2. shell: true in spawnSync: required on Windows (pnpm is a .cmd shim). Cross-platform safe.
3. LOC 351 vs ~280 estimated: createRequire block + inline ComponentEvent type + Windows spawnSync fix added ~71 extra lines.
4. Generated both component-telemetry-rollup.md (task brief name) and component-rollup-phase-6.md (B.1 spec name).

## Concerns (DONE_WITH_CONCERNS)
1. **ESM/CJS import workaround**: The createRequire approach works but is less elegant than a direct ESM import. Root cause: packages/core/ lacks "type": "module" and exports field. Future fix: add exports + type:module to packages/core/package.json OR extract the schema into a shared package. Documented here for reviewer awareness.
2. **Inline ComponentEvent type**: To avoid the ESM import issue, the ComponentEvent type is defined locally in the script. If the canonical schema changes (new fields), the local type will drift. Mitigated by: (a) the createRequire'd parseTelemetryLine still uses the Zod schema at runtime — type drift only affects TypeScript type-checking, not runtime validation; (b) B.6 I-10 is satisfied (Zod still runs).
3. **No `command` type in live JSONL**: The 2,446-line live JSONL contains only hook, agent, and skill component types — no command type. This is expected given current telemetry coverage. C.3 still passes (14 rows >> 4 required).

## Assumptions Made
- createRequire(import.meta.url) + resolve() path to .ts file works because tsx's CJS loader handles .ts extension resolution when required. Verified by running the script directly.
- shell: true is the correct cross-platform fix for Windows pnpm invocation in spawnSync.
- B.3 says "emitMarkdown" must preserve its name — satisfied (function is named emitMarkdown, grep count = 6 as required).
- The deliverable path "component-telemetry-rollup.md" (from task brief) and "component-rollup-phase-6.md" (from B.1 spec) are both generated. The spec-named one is the canonical output.
