# Task 8.7.2 — Layered Config Resolver Implementation

## Status
DONE_WITH_CONCERNS

## Files Changed
- packages/core/src/config/layered-resolver.ts (new, 569 LOC)
- packages/core/src/config/layered-resolver.spec.ts (new, 465 LOC)

## Tests Added
- packages/core/src/config/layered-resolver.spec.ts: 14 cases
  - Test #1: all 4 layers present + merged correctly (deepest layer wins)
  - Test #2: layers 2-4 missing; graceful skip + debug log; no throw
  - Test #3: type mismatch (string vs object): last-layer-wins + logger.warn
  - Test #4a: array concat-with-dedup (2 unique entries merged)
  - Test #4a-dedup: identical entries from two layers deduplicated to 1
  - Test #4b: !override directive: repo layer replaces user layer array entirely
  - Test #5: invalid Zod enum in user layer: layer skipped + warn; no throw
  - Test #6a: telemetry key in Layer 3 project: skipped + warn (default mode)
  - Test #6b: telemetry key in Layer 3 project: LayerLoadError thrown (strict mode)
  - Test #7: malformed YAML: layer skipped + warn; no throw
  - Test #8a: POSIX HOME path resolution
  - Test #8b: Windows USERPROFILE path resolution
  - Test #8c: XDG_CONFIG_HOME path resolution
  - Test #9: strict mode throws on first missing layer (optional bonus)

## Gates
- typecheck: PASS (tsc --noEmit exit 0)
- lint: PASS (eslint exit 0, one fix applied: unsafe spread cast)
- test: PASS (14/14)
- invariants:
  - PASS: grep anthropic|openai in layered-resolver.ts → exit 1 (no matches)
  - PASS: I-6 no commits (git log | wc -l = 0)
  - PASS: domain-pure (no NestJS imports in layered-resolver.ts)
  - PASS: I-14 no singleton (resolver instantiated per-call)
  - PASS: telemetry rejected in Layer 3 via z.preprocess (Decision 031)

## Deviations from Plan
1. fileLoader injectable (plan listed this as an option): adopted. Resolver accepts
   `fileLoader: (path: string) => string | null` instead of calling fs directly.
   Default loader wraps fs.readFileSync. This satisfies domain-pure AND makes testing
   trivial (in-memory fileLoader in all tests, no tmpdir). Spec §3 explicitly endorses this.

2. z.preprocess for Layer 3 telemetry rejection: ProfileSchema uses Zod strip mode
   (unknown keys silently removed), so superRefine on post-strip data never sees
   `telemetry`. Used z.preprocess((raw, ctx) => { reject if telemetry in raw }, ProfileSchema)
   instead. This correctly rejects at the raw-input inspection stage.

3. LOC slightly over budget (see Concerns below).

4. Test #8 (cross-platform paths): on Windows, node:path.join uses backslashes.
   All path assertions in Test #8 normalize via .replace(/\\/g, '/') for
   cross-platform correctness. This was required; not a spec deviation.

## Concerns (DONE_WITH_CONCERNS)
1. Production LOC = 569 vs spec budget ≤500 (aim 300-400). The excess is
   ~170 lines of JSDoc comments referencing spec sections. Functional logic
   is ~397 non-comment lines. Reviewer may decide to trim docs; functionally
   within budget. No spec functionality was added speculatively.

2. NestJS module NOT added (plan §3: "if spec requires NestJS wiring, implement").
   Spec §3.1 explicitly states "For substage 8.7.2 the deliverable is the
   pure-functional resolver only." Conservative choice: no module wrapper created.
   nestjs_module_added = false.

## Assumptions Made
- fileLoader injectable is the correct interpretation of "domain-pure with no direct fs"
  per spec §3 note about injectable fileLoader.
- `!override` is a literal key suffix in YAML (e.g., hookTargets!override:) — not a
  YAML tag. This is the spec's intent per §2.2 example.
- On Windows, path.join('/fake/home', '.orch', 'config.yaml') produces backslash paths.
  Tests normalize for comparison. The resolver is path-agnostic; callers provide
  resolved absolute paths.
- Zod v4 (4.3.6) is installed; z.preprocess ctx.addIssue API confirmed working.
- Test runner is Jest (ts-jest), not vitest — the core package.json uses jest@30.
