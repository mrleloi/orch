# nestjs-module self-test

## Trigger

Creating or editing `*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.repository.ts`,
dependency injection setup, or module-level tests in `packages/core/`.

## Expected behavior (PASS)

Skill activates and guides module construction so that:
- Feature internals are NOT leaked via `export *` barrels
- Cross-feature communication routes through EventBus or shared infra modules only
- Adapter wiring uses `Symbol.for(...)` DI tokens, never raw concrete class identifiers

## Named failure modes

- F1: `export *` barrel in a feature module `index.ts` exposes private internals (Anti-Pattern #1)
- F2: Circular module import across feature modules instead of using EventBus (Anti-Pattern #2)
- F3: `@Inject(ConcreteClass)` instead of `@Inject(SOME_SYMBOL_TOKEN)` for adapter wiring (`IAgentRuntime` pattern violation)

## Metrics

- activation_count_per_session: 0-4
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. NO `export *` lines exist in feature module `index.ts` files under
   `packages/core/src/modules/` — verified by:
   `grep -rn "export \*" packages/core/src/modules/ --include="index.ts"` returning zero lines.
2. Cross-module imports: files inside `packages/core/src/modules/<A>/` MUST NOT import
   directly from `packages/core/src/modules/<B>/` (other than shared `events`, `db`, `config`
   infra modules) — verified by a dependency-direction grep across all module subdirectories.
3. Every `@Inject(...)` call in adapter wiring uses a `Symbol.for(...)` token:
   `grep -rn "@Inject([A-Z]" packages/core/src/` MUST return zero hits (only
   `@Inject(SOME_SYMBOL_TOKEN)` form with a constant identifier is permitted, never a class).
