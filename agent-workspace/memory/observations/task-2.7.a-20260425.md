# Task 2.7.a — Tailwind + shadcn/ui install + design tokens

## Status
DONE_WITH_CONCERNS

## Files Changed
- packages/web-ui/package.json — added deps + devDeps (pnpm install, not manual edit)
- packages/web-ui/tailwind.config.ts — created
- packages/web-ui/postcss.config.js — created
- packages/web-ui/src/index.css — prepended @tailwind directives + shadcn HSL CSS vars (kept legacy vars)
- packages/web-ui/tsconfig.app.json — added paths alias @/* -> ./src/*  (no baseUrl — deprecated in TS6)
- packages/web-ui/vite.config.ts — added resolve.alias @/* -> src/
- packages/web-ui/vitest.config.ts — added resolve.alias @/* -> src/ for test resolution
- packages/web-ui/components.json — created shadcn config
- packages/web-ui/eslint.config.js — added allowConstantExport: true for react-refresh rule
- packages/web-ui/src/lib/utils.ts — created cn() helper
- packages/web-ui/src/components/ui/button.tsx — vendored shadcn
- packages/web-ui/src/components/ui/card.tsx — vendored shadcn
- packages/web-ui/src/components/ui/alert-dialog.tsx — vendored shadcn (mandatory I-6)
- packages/web-ui/src/components/ui/badge.tsx — vendored shadcn
- packages/web-ui/src/components/ui/skeleton.tsx — vendored shadcn
- packages/web-ui/src/components/ui/ui-smoke.spec.tsx — 5 smoke tests

## Tests Added
- packages/web-ui/src/components/ui/ui-smoke.spec.tsx: 5 cases (Button, Card, AlertDialog, Badge, Skeleton)

## Gates
- typecheck: PASS (tsc --noEmit, 0 errors)
- lint: PASS (0 errors; 2 warnings for shadcn pattern allowConstantExport)
- build: PASS (vite build produces 14.19 kB CSS bundle; tsc -b has pre-existing failures — see Concerns)
- test: PASS (38/38 web-ui; 944/944 monorepo)
- invariants: PASS (I-3, I-4, I-7 all clear)

## Deviations from Plan
- `main.tsx` already had `import './index.css'` — no change needed
- Added `resolve.alias` to `vitest.config.ts` as well (not in plan but required for test resolution of @/* imports)
- Changed `allowConstantExport` to `true` in eslint.config.js (not in plan, required for shadcn pattern)
- TS6 deprecation: `baseUrl` omitted from tsconfig (plan said add it, but TS6 treats it as deprecated and errors on `tsc -b`)

## Concerns (DONE_WITH_CONCERNS)
1. `pnpm --filter @orch/web run build` (which runs `tsc -b && vite build`) fails on pre-existing TypeScript errors:
   - `src/api/client.ts:101` — erasableSyntaxOnly violation (pre-existing)
   - `src/App.tsx`, `src/pages/*.tsx`, `src/auth/token-gate.spec.tsx` — `JSX.Element` namespace not found (pre-existing, TS strict mode)
   These errors existed before this task. The vite build step itself succeeds and produces CSS > 0 bytes when run standalone.
   Recommendation: a follow-up task should fix the `JSX.Element` → `React.ReactElement` migration and add `/// <reference types="vitest/globals" />` or exclude spec files from `tsconfig.app.json`.

## Assumptions Made
- `main.tsx` already imported `./index.css` — confirmed and no change made
- `baseUrl` omitted per TS6 deprecation — `paths` alone works with `moduleResolution: bundler`
- ESLint `allowConstantExport: true` is the canonical shadcn/ui approach for variant exports alongside components
- `vitest.config.ts` needs same alias as `vite.config.ts` for test imports to resolve `@/*`
- Pre-existing `tsc -b` failures are out of scope for 2.7.a
