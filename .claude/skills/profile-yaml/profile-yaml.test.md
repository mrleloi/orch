# profile-yaml self-test

## Trigger

Editing .orch/profile.yaml, the profile zod schema
(packages/core/src/domain/profile.schema.ts), profile-loader,
`ProjectRegistryService`, or any code that reads, parses, or
validates profile files.

## Expected behavior (PASS)

Skill activates and every `readFileSync(...profile.yaml...)` call is
followed by `loadProfile(` or `profileSchema.parse(` within 5 lines
(zod-at-boundary, I-10 satisfied). Profile contents are never logged
in full. Hot-reloaded profile lives in an `@Injectable` service field,
not module-scope mutable state (I-14 satisfied).

## Named failure modes

- F1: YAML read without `zod.parse` — raw object returned as `any`,
  untyped leak bypasses schema enforcement (Anti-Pattern #1, I-10 violation)
- F2: Full profile object passed to `console.log` or `logger.info` —
  sensitive paths exposed in logs (Anti-Pattern #2)
- F3: Hot-reloaded profile stored in a module-level `let profile`
  variable instead of a NestJS-DI `@Injectable` service field
  (Anti-Pattern #3, I-14 violation)

## Metrics

- activation_count_per_session: 0-2
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. Every `readFileSync` call referencing `profile.yaml` in
   `packages/core/src/` is followed within 5 lines by `loadProfile(`
   or `profileSchema.parse(` (zod-at-boundary, I-10 grep).
2. No `console.log` or `logger.info` call in `packages/core/src/`
   passes a full profile object — only redacted or scalar fields are
   logged (grep for `log.*profile` patterns; full-object log is
   forbidden).
3. `let profile` and `var profile` at module scope are absent from
   `packages/core/src/` — hot-reloaded profile state must live in an
   `@Injectable` service field, not module-level mutable state (I-14
   grep).
