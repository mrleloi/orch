---
title: Config Layering Model
status: normative
ratified_by: Decision 030 (LICENSE MIT) + Decision 031 (telemetry NDJSON) + research output 8.0.2
applies_to: packages/core/src/config/, ~/.orch/, <project>/.orch/
implementer: substage 8.7.2 (layered-resolver.ts)
reviewer: substage 8.7.6 (triple review)
authoring_substage: 8.7.1
phase: 8
binding_until: layering proves inadequate (see §8)
cross_references:
  - Decision 030 (LICENSE MIT, MIT confirmed §6 below)
  - Decision 031 (telemetry sync — user-scope only; binds layer 2 placement of upstream_sync)
  - Decision 029 (tenancy file-level — binds user-scope rule)
  - Decision 028 (config-style normative format — binds frontmatter for THIS doc)
  - Charter Principle 8 (Reusable without forking — line 67)
  - Charter §"Craft Philosophy" (personal-first; team-share second — line 39)
  - Master plan §3 8.7 (substage 8.7.1 deliverable lines 146-156)
  - Research output 8.0.2 §S2 (4-scope layering survey lines 28-76) + R-1..R-7 (lines 173-208)
  - tenancy-model.md §3 (folder layout — Layer 3/4 paths nest under tenancy roots)
  - Invariants I-1, I-2, I-10, I-14
---

# Config Layering Model — system / user / project / repo

> Four-layer config resolution for orch. Layered precedence: `system → user
> → project → repo` with deep-merge for nested keys, array-replace via
> `!override` directive, and Zod-validated schemas at each layer. Personal-first
> mental model preserved: empty layers = bare-defaults boot; layers 2-4 are
> opt-in. Compatible with existing single-user installs; no migration required.

## §1 Layering taxonomy

Four layers, lowest precedence first. Higher-numbered layers override
lower-numbered when the same key is present.

### §1.1 Layer 1 — system (defaults baked into npm package)

**Path**: `node_modules/@orch/core/dist/config/defaults.json` (or equivalent
TypeScript constant module — see §3 implementation surface).
**Persistence**: shipped immutable in the published npm tarball.
**Editable by user?**: NO. Edits would not survive `npm install`.
**Intended use**: project-agnostic baseline (charter Principle 3, line 57). Holds the
sane defaults every install starts with.

Sample keys (illustrative, not exhaustive):

```yaml
budget:
  warn_at_tokens: 200000
  force_handoff_at_tokens: 230000
heartbeat_timeout_ms: 180000
absolute_ceiling_ms: 1800000
log_level: info
http:
  port: 4141
  host: 127.0.0.1
trace_backend: otlp
```

**Rationale**: every value here MUST be safe to ship to a fresh-install user
who has set zero environment variables and authored zero config files. It is
the fallback floor for `LayeredResolver.resolve()` — no key the resolver
returns can be `undefined` if the key has a system default.

### §1.2 Layer 2 — user (per-machine personal override)

**Path** (resolution order, first hit wins):
1. `$XDG_CONFIG_HOME/orch/config.yaml` (if `XDG_CONFIG_HOME` is set; POSIX-XDG
   convention).
2. `~/.config/orch/config.yaml` (POSIX fallback when XDG_CONFIG_HOME unset).
3. `~/.orch/config.yaml` (Windows + macOS-Unix simple-default; mirrors
   tenancy-model.md §7.2 `~/.orch/profile.local.yaml` pattern).
4. `%USERPROFILE%\.orch\config.yaml` (Windows when `%USERPROFILE%` is set
   and `~` does not resolve).

**Persistence**: gitignored at the user's `~/` level by convention; orch
never authors content here without explicit `orch init` flow.
**Editable by user?**: YES (this is the primary personal-edit surface).
**Intended use**: per-machine personal preferences applying to ALL projects
this user runs (e.g., `default_log_level: debug`, `default_model: opus`,
`telemetry.enabled: true`).

Sample keys (illustrative):

```yaml
# ~/.orch/config.yaml
log_level: debug
default_model: opus
telemetry:
  enabled: false              # opt-in; defaults OFF (Decision 031)
  endpoint: ""                # only meaningful when enabled = true
  include_user_hash: false    # additional privacy opt-in (Decision 031 §"Schema")
ui:
  preferred_editor: code
```

**User-scope-only constraint** (Decision 031 cross-binding): the `telemetry.*`
sub-tree is REJECTED in Layer 3 (project) and Layer 4 (repo) at parse time.
See §4 Test #6 (project-scope `telemetry.enabled` → schema-rejection error).

### §1.3 Layer 3 — project (per-managed-project, committed)

**Path**: `<project>/.orch/profile.yaml` — EXISTING surface; this is the file
already implemented by `packages/core/src/domain/profile.ts` (`ProfileSchema`
in lines 116-319). Layer 3 is not new code; the layered resolver simply
adopts the existing parsed-profile output as its third layer.

**Persistence**: committed to the project repo. Shared across all
contributors of the project.
**Editable by user?**: YES (via `orch init` or manual edit; commits to project
repo are normal project-engineering hygiene).
**Intended use**: project-specific configuration that all contributors share —
session types, hook targets, cron schedules, ccs profile name, project-scoped
context budget overrides, worktree isolation flag.

Sample keys (illustrative; matches existing profile.ts schema):

```yaml
# <project>/.orch/profile.yaml
projectId: my-coding-project
rootPath: /workspace/my-coding-project
ccsProfile: subscription-account-1
sessionTypes:
  - name: focused-impl
    promptTemplate: "Implement {{plan}} per spec."
contextBudget:
  warnAtTokens: 220000          # this project favors larger context budget
  forceHandoffAtTokens: 240000
hookTargets:
  - { event: SessionStart, url: http://127.0.0.1:4141/hooks/session-start }
worktreeIsolation: false
tenancy:
  mode: personal                # tenancy-model.md §3.3
```

**Schema authority**: `packages/core/src/domain/profile.ts` (existing, frozen
for backwards-compat per §5). The layered resolver consumes the parsed Profile
as Layer 3 input via `LayerSource { name: 'project', path:
'<project>/.orch/profile.yaml' }`.

### §1.4 Layer 4 — repo (per-repo, gitignored)

**Path**: `<project>/.orch/profile.local.yaml` — NEW surface in v2.3 per
research 8.0.2 §S6 R-6 (lines 200-204). Mirrors Claude Code's
`.claude/settings.local.json` convention.

**Persistence**: gitignored by default (orch init / orch attach amends
`.gitignore` to include `.orch/profile.local.yaml` and
`.orch/CONTEXT.local.md`).
**Editable by user?**: YES (this is the per-checkout personal override).
**Intended use**: highest-precedence per-repo override that should NOT be
shared with collaborators (e.g., a contributor experimenting with a different
ccs profile, a personal log-level bump for one work session, a per-repo
debug flag).

Sample keys (illustrative):

```yaml
# <project>/.orch/profile.local.yaml — gitignored
log_level: trace                # this checkout only
ccsProfile: my-personal-ccs     # override for this contributor's clone
contextBudget:
  warnAtTokens: 180000           # this contributor prefers earlier wind-down warnings
hookTargets:
  - { event: Stop, url: http://127.0.0.1:4141/hooks/stop }   # adds a per-repo hook
```

**Repo-scope-only constraint**: like Layer 2, the `telemetry.*` sub-tree is
REJECTED in Layer 4 (Decision 031 §"Default state" line 88). Layer 4 may
override anything else.

### §1.5 Layering precedence summary

| Layer | Path | Precedence | Persistence | Edit-by-user | Telemetry-keys-allowed |
|---|---|---|---|---|---|
| 1 system | `node_modules/@orch/core/dist/config/defaults.json` | LOWEST | shipped immutable | NO | yes (defaults only) |
| 2 user | `~/.orch/config.yaml` (or XDG path) | second | per-machine, gitignored | YES | YES (only here) |
| 3 project | `<project>/.orch/profile.yaml` | third | committed | YES | NO (rejected at parse) |
| 4 repo | `<project>/.orch/profile.local.yaml` | HIGHEST | per-repo, gitignored | YES | NO (rejected at parse) |

Higher precedence wins on key conflicts. The merge strategy (deep vs replace)
is specified in §2.

## §2 Resolution algorithm

Pseudocode (substage 8.7.2 implements as `LayeredResolver.resolve()`):

```
resolve(layers: LayerSource[]): ResolvedConfig
  1. result = {}                                # empty object
  2. for layer in layers (in declared order, expected: system, user, project, repo):
       2a. raw = loadLayer(layer)               # read+parse YAML/JSON
           if read error AND strict_mode: throw LayerLoadError
           if read error AND default_mode:  log_warn + continue   # skip layer
       2b. parsed = ZodSchema.safeParse(raw)
           if !parsed.success AND strict_mode: throw LayerLoadError
           if !parsed.success AND default_mode:
               log_warn + continue              # skip bad layer
       2c. result = deepMerge(result, parsed.data)
  3. return result
```

### §2.1 Deep-merge default semantics

For two objects A (lower precedence) and B (higher precedence), `deepMerge(A,
B)` recursively merges:

- **Both keys are objects**: recurse into the sub-tree.
- **Both keys are scalars** (string, number, boolean, null): B wins.
- **Both keys are arrays**: deep-concat-with-dedup by default (§2.2).
- **Type mismatch** (e.g., A is string, B is object, or A is array, B is
  scalar): B wins (last-layer-wins on type conflict). A `log_warn` is emitted
  documenting the override; value is NOT silently coerced.

### §2.2 Array merge: concat-with-dedup default; opt-in replace via `!override`

Default for array-valued keys: **deep-concat with deduplication** (mirrors
Claude Code official settings; research 8.0.2 §S2.2 line 60-61, §S6 R-2
lines 175-179).

Example:

```yaml
# Layer 2 (user)
hookTargets:
  - { event: SessionStart, url: http://127.0.0.1:4141/hooks/start }

# Layer 3 (project)
hookTargets:
  - { event: Stop, url: http://127.0.0.1:4141/hooks/stop }

# Resolved
hookTargets:
  - { event: SessionStart, url: http://127.0.0.1:4141/hooks/start }   # from layer 2
  - { event: Stop,         url: http://127.0.0.1:4141/hooks/stop }    # from layer 3
```

Deduplication is by JSON-stable-stringify of the array element. Identical
elements across layers are merged into a single entry (lower-layer position
preserved).

**Opt-in replace via `!override` directive**: when an upper layer wants to
replace (rather than concat) a lower layer's array, the upper-layer authors
the key with the `!override` suffix:

```yaml
# Layer 4 (repo)
hookTargets!override:
  - { event: SessionStart, url: http://127.0.0.1:4141/hooks/custom-start }
# Resolved hookTargets becomes ONLY this single entry (layer-2 + layer-3 hooks discarded)
```

The resolver strips the `!override` suffix during merge and replaces the
array entirely. Test §4 #4 covers this case.

### §2.3 Missing layer = no-op (graceful degradation)

If a layer's file does not exist:
- Default mode (production): log a `debug`-level message and skip the layer.
  Resolution proceeds with remaining layers. This is the EXPECTED state for
  layers 2 and 4 on a fresh install.
- Strict mode (CI / `orch verify`): throw `LayerLoadError` if any declared
  layer's file is missing. Used in golden-config validation tests.

A bare-install user (no `~/.orch/config.yaml`, no `<project>/.orch/profile.local.yaml`)
runs entirely on layers 1 + 3 with zero warnings.

### §2.4 Type validation at merge time via Zod schemas

Each layer is validated against a Zod schema BEFORE merge:

| Layer | Schema | Source-of-truth file |
|---|---|---|
| 1 | `SystemDefaultsSchema` | `packages/core/src/config/system-defaults.schema.ts` (NEW in 8.7.2) |
| 2 | `UserConfigSchema` | `packages/core/src/config/user-config.schema.ts` (NEW in 8.7.2) |
| 3 | `ProfileSchema` | `packages/core/src/domain/profile.ts` (EXISTING; frozen for backwards-compat) |
| 4 | `RepoOverrideSchema` | `packages/core/src/config/repo-override.schema.ts` (NEW in 8.7.2) |

Each schema is a strict subset of the merged output type — schemas describe
what each layer is ALLOWED to author, not what the merged config requires.
The merged-output type is `ResolvedConfig` defined as the union of all four
schemas (modulo §1 telemetry-key restriction).

**Telemetry-key restriction enforced in schemas**:
- `UserConfigSchema` permits `telemetry.*` keys.
- `ProfileSchema` rejects `telemetry.*` (Decision 031 §"Default state" line 88).
- `RepoOverrideSchema` rejects `telemetry.*` (Decision 031 cross-binding).

Bad layer (parse failure) handling per §2.3: log_warn + skip layer in default
mode; throw `LayerLoadError` in strict mode.

## §3 Public API surface for `packages/core/src/config/layered-resolver.ts`

Substage 8.7.2 implements this exact surface. Domain-layer ZERO framework
dependency: this file imports `zod` and `node:fs`/`node:path` only. NO NestJS
imports per architecture.md §"Domain layer". I-14 NO singleton: resolver is
instantiated per-call, not module-level.

```typescript
// packages/core/src/config/layered-resolver.ts

import { z } from 'zod';

/** A single layer source descriptor — what to load and how to label it. */
export interface LayerSource {
  /** Layer identity. Used for logging and resolution-order assertions. */
  name: 'system' | 'user' | 'project' | 'repo';
  /**
   * Absolute path to the layer's YAML/JSON file.
   *
   * For Layer 1 (system), this is typically the dist-bundled defaults.json.
   * For Layer 2 (user), $HOME-resolved per §1.2.
   * For Layer 3 (project), the project's <root>/.orch/profile.yaml.
   * For Layer 4 (repo), the project's <root>/.orch/profile.local.yaml.
   */
  path: string;
  /** Zod schema to validate the layer's parsed content. */
  schema: z.ZodTypeAny;
}

/** Resolution mode controlling missing-layer / parse-failure behavior. */
export type ResolutionMode = 'default' | 'strict';

/** Resolver options. Constructor input. */
export interface LayeredResolverOptions {
  layers: LayerSource[];
  mode?: ResolutionMode;       // default: 'default'
  /** Optional logger; defaults to a no-op so domain layer stays framework-free. */
  logger?: {
    warn(msg: string, ctx?: Record<string, unknown>): void;
    debug(msg: string, ctx?: Record<string, unknown>): void;
  };
}

/** Output of LayeredResolver.resolve() — deep-merged config. */
export type ResolvedConfig = Record<string, unknown>;

/**
 * Error thrown when a layer fails to load OR fails Zod validation in strict mode.
 *
 * In default mode, layer failures are logged and skipped — this error is NOT thrown.
 * In strict mode, the first failure throws and the resolver aborts.
 *
 * I-12: domain-layer error class; wrapped at adapter boundary if needed.
 */
export class LayerLoadError extends Error {
  constructor(
    public readonly layerName: LayerSource['name'],
    public readonly layerPath: string,
    public readonly cause: unknown,
  ) {
    super(
      `[layered-resolver] layer '${layerName}' at '${layerPath}' failed to load: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = 'LayerLoadError';
  }
}

/**
 * LayeredResolver — deterministic, framework-free 4-layer config resolver.
 *
 * Pure-functional core; no module-level state (I-14).
 * Domain-layer ZERO framework dependency (architecture.md §"Domain layer").
 * Daemon-dumb-compliant: NO LLM logic; pure deterministic merge (I-1).
 */
export class LayeredResolver {
  constructor(private readonly options: LayeredResolverOptions) {}

  /**
   * Resolve all layers in declared order; return merged config.
   *
   * @throws LayerLoadError if mode='strict' and any layer fails to load or parse.
   * @returns ResolvedConfig — deep-merged output across all layers.
   */
  resolve(): ResolvedConfig {
    /* implementation: see §2 algorithm */
    throw new Error('not implemented — substage 8.7.2');
  }
}

/**
 * Build the canonical 4-layer source descriptor for a given project.
 *
 * Helper used by daemon entry-points to construct the standard layering.
 * Each layer's schema is bound here; downstream LayeredResolver consumes the array.
 *
 * @param projectRoot absolute path to the managed project root
 * @param userHome absolute path to the user home dir (resolved $HOME / $XDG / %USERPROFILE%)
 * @param systemDefaultsPath absolute path to the dist-bundled defaults.json
 */
export function buildDefaultLayers(
  projectRoot: string,
  userHome: string,
  systemDefaultsPath: string,
): LayerSource[] {
  /* implementation: see §1 path resolution rules */
  throw new Error('not implemented — substage 8.7.2');
}
```

### §3.1 Adapter pattern integration

The daemon's `ConfigService` (NestJS module) consumes `LayeredResolver` as a
dependency injected at the module boundary. Domain layer never imports
NestJS; the boundary is one wrapper file `packages/core/src/modules/config/
config.service.ts` (8.7.2 NOT responsible — that's a follow-up if needed).

For substage 8.7.2 the deliverable is the pure-functional resolver only.

## §4 Test cases for substage 8.7.2 (8 unit tests minimum)

Test file: `packages/core/src/config/layered-resolver.spec.ts`. Vitest, in-memory
fixtures, NO real filesystem outside test tmpdir (I-13).

### §4.1 Test #1 — All 4 layers present + merged correctly

- **Arrange**: 4 in-memory layer fixtures with non-conflicting keys; default mode.
- **Act**: `resolver.resolve()`.
- **Assert**: result contains union of keys from all 4 layers; each key's value
  matches the originating layer.

### §4.2 Test #2 — Layers 2-4 missing (graceful degradation)

- **Arrange**: only Layer 1 system defaults present; Layers 2-4 paths point to
  non-existent files; default mode.
- **Act**: `resolver.resolve()`.
- **Assert**: result equals Layer 1 content; logger.debug called for each
  missing layer; no LayerLoadError thrown.

### §4.3 Test #3 — Conflicting types (type mismatch warns + last-layer-wins)

- **Arrange**: Layer 1 has `key: "string-value"`; Layer 2 has `key: { object: true }`.
- **Act**: `resolver.resolve()`.
- **Assert**: result.key === `{ object: true }` (Layer 2 wins per §2.1
  type-mismatch rule); logger.warn called with type-mismatch context; NO
  silent coercion attempted.

### §4.4 Test #4 — Array merge default (concat-dedup) AND `!override` replace

Two sub-cases:
- **#4a default concat**: Layer 2 hookTargets has 1 entry; Layer 3 hookTargets has 1
  different entry. Expected: result.hookTargets has 2 entries (concat order
  preserved).
- **#4b `!override` replace**: Layer 2 hookTargets has 2 entries; Layer 3
  `hookTargets!override` has 1 entry. Expected: result.hookTargets has only
  the 1 entry from Layer 3; Layer 2 entries discarded.

### §4.5 Test #5 — Zod schema validation rejects bad layer (default mode skip)

- **Arrange**: Layer 2 file has `log_level: "invalid-level"` (not in enum).
- **Act**: `resolver.resolve()` in default mode.
- **Assert**: result does NOT include layer 2 contributions; logger.warn
  called with Zod error details; no throw.

### §4.6 Test #6 — Layer 3 telemetry-key REJECTED at schema-parse

- **Arrange**: Layer 3 `<project>/.orch/profile.yaml` contains
  `telemetry: { enabled: true }` (forbidden per Decision 031).
- **Act**: `resolver.resolve()` in DEFAULT mode AND strict mode.
- **Assert (default mode)**: schema parse fails; logger.warn emitted; layer 3
  skipped; remaining layers merged as if layer 3 absent.
- **Assert (strict mode)**: `LayerLoadError` thrown with layerName='project'
  and Zod error message citing `telemetry.enabled` rejection.

### §4.7 Test #7 — Layer file syntax error → graceful skip with warning

- **Arrange**: Layer 2 file has malformed YAML (e.g., unclosed bracket).
- **Act**: `resolver.resolve()` in default mode.
- **Assert**: logger.warn called with parse-error details; result omits Layer
  2 contributions; no throw.

### §4.8 Test #8 — Cross-platform path resolution

- **Arrange**: Set `process.env.HOME = '/fake/home'` (POSIX), then `delete
  process.env.HOME; process.env.USERPROFILE = 'C:\\Users\\fake'` (Windows fallback).
- **Act**: `buildDefaultLayers(projectRoot, resolveUserHome(), systemDefaultsPath)`.
- **Assert**: layer 2 path correctly resolves to `/fake/home/.orch/config.yaml`
  in POSIX case AND `C:\Users\fake\.orch\config.yaml` in Windows case.
  XDG_CONFIG_HOME variant: `process.env.XDG_CONFIG_HOME =
  '/xdg/conf'` → layer 2 path is `/xdg/conf/orch/config.yaml`.

### §4.9 Optional Test #9 (bonus) — Strict mode throws on first failure

- **Arrange**: Layers 1+3 valid; Layer 2 missing; mode='strict'.
- **Act**: `resolver.resolve()`.
- **Assert**: `LayerLoadError` thrown with layerName='user'; resolver does NOT
  proceed to Layers 3+4.

(Test #9 marked OPTIONAL because §4.5 + §4.6 already exercise both error paths;
add only if budget allows.)

## §5 Backwards-compat (existing single-user installs)

Mandatory invariant: a v2.2 single-user install MUST run identically under
v2.3 with the layered resolver — zero migration, zero new config files
required.

**Mechanism**:

1. **Layer 1 always present** (shipped in npm tarball; no user authoring).
2. **Layer 2 missing**: graceful skip per §2.3 (default mode).
3. **Layer 3 = existing `<project>/.orch/profile.yaml`**: schema is the
   already-frozen `ProfileSchema` from `packages/core/src/domain/profile.ts`.
   No breaking changes to profile.ts schema in v2.3 (8.7.1 authority §"DO NOT have
   authority to change profile-yaml schema").
4. **Layer 4 missing**: graceful skip per §2.3.

**Acceptance test** (substage 8.7.2 deliverable): take a v2.2 install fixture
(only Layer 3 present); run `LayeredResolver.resolve()`; assert output is
deep-equal to `parseProfile(layer3).data` extended with Layer 1 system
defaults for unset keys. No user action required.

**Backwards-compat shim retention horizon**: PERMANENT. Layers 2+4 are
opt-in forever; "single-user install with only profile.yaml" is a
first-class supported configuration, not a deprecation path. Mirrors
tenancy-model.md §7.4 backwards-compat shim retention horizon.

## §6 LICENSE recommendation — MIT confirmed (Decision 030 default ratified)

**Confirmed: MIT.** No patent-grant rationale surfaced during 8.7.1 design.
Decision 030's pre-bound default stands.

**Rationale (one paragraph)**: All 5 surveyed personal-tool reference repos
(claudegram, claude-to-im, praktor, nanoclaw, claudekit-skills) use MIT;
zero use Apache-2.0 (research 8.0.2 §S3 lines 81-86). The Apache-2.0 patent
grant clause is the single feature MIT lacks, but at orch's v2.3 scale (≤10
contributors expected; no patentable IP in repo) the patent-assertion risk
is mitigated by Developer Certificate of Origin (DCO) sign-off in
CONTRIBUTING.md per Decision 030 Consequence 3 — adequate without the
text-length and ecosystem-deviation cost of Apache-2.0. Charter Principle 8
("Reusable without forking") is best served by the most-permissive license
the npm ecosystem recognizes; that license is MIT. Karpathy P2 ("Simplicity
First"): one LICENSE file vs Option C's dual-license (LICENSE-MIT +
LICENSE-APACHE); pick the simplest. **No 8.7.1-surfaced reason to revisit
Decision 030.**

The LICENSE file at `<repo-root>/LICENSE` carries the MIT text per Decision
030 §"Year + copyright holder placeholder format" (lines 79-100). Substage
8.7.4 ratifies the file; substage 8.7.5 verifies `package.json` `license:
"MIT"` and `npm pack --dry-run` exit 0.

## §7 Substage 8.7 sub-task design (orchestrator dispatch reference)

This section informs substages 8.7.2-8.7.6. Not authoritative for sub-task
internal design — each sub-task's own brief is.

| Sub-task | Input from THIS doc | Primary output | Effort | Reviewer |
|---|---|---|---|---|
| 8.7.2 | §3 API surface + §4 test cases | `packages/core/src/config/layered-resolver.ts` + `layered-resolver.spec.ts` (≥8 tests) | sonnet/medium | code-quality-reviewer |
| 8.7.3 | Decision 031 + this doc §1.2 (telemetry user-scope only) | `packages/core/src/telemetry/sync-seam.ts` + 2 sinks (HttpsNdjsonSink, StdoutDryRunSink, NullSink) + sanitize() + 8 unit tests | sonnet/medium | code-quality-reviewer |
| 8.7.4 | Decision 030 + this doc §6 + research 8.0.2 §S3 line 98-104 | LICENSE + CONTRIBUTING.md + CODE_OF_CONDUCT.md + SECURITY.md + .github/ISSUE_TEMPLATE/{bug_report,feature_request}.md + .github/pull_request_template.md | sonnet/low | spec-compliance-reviewer |
| 8.7.5 | package.json + this doc §1.1 (system defaults shipping path) | `package.json` exports + `files` glob + `npm pack --dry-run` exit 0 + tarball <5MB | sonnet/low | spec-compliance-reviewer |
| 8.7.6 | all 8.7.x outputs | spec-compliance-reviewer + code-quality-reviewer + sandwich-verifier triple PASS | opus/max | self (closing) |

### §7.1 Inter-substage data flow

```
8.7.1 (this doc)
    ↓
8.7.2 layered-resolver.ts ←──┐
                             │
8.7.3 telemetry/sync-seam ←──┤  consumes layered-resolver to read user-scope telemetry config
                             │
8.7.4 OSS docs ──────────────┤  cites this doc + Decision 030
                             │
8.7.5 npm prep ──────────────┘  ships layered-resolver.ts + sync-seam.ts in tarball; layer 1 defaults.json must be in `files` glob
        ↓
      8.7.6 triple review (verifies all of the above)
```

### §7.2 Acceptance gates per sub-task (Part-C surface)

- 8.7.2: `pnpm --filter @orch/core test layered-resolver.spec.ts` exit 0;
  `grep -rn "anthropic\|openai" packages/core/src/config/` exit 1
  (I-1 invariant guard); `pnpm --filter @orch/core typecheck` exit 0.
- 8.7.3: `pnpm --filter @orch/core test sync-seam.spec.ts` exit 0;
  `grep -E "telemetry.enabled.*true" packages/core/src/config/defaults.*` exit 1
  (default-OFF guard); 5+ adversarial PII sanitize() tests in spec.
- 8.7.4: each file exists at expected path; `markdownlint` exit 0 on each.
- 8.7.5: `npm pack --dry-run` exit 0; tarball size <5MB; `system-defaults.json` listed in tarball.
- 8.7.6: all three reviewers PASS; `bash scripts/audit/oss-readiness.sh` exit 0.

## §8 Daemon-level fallback condition (when 4-layer model warrants extension)

Mirrors tenancy-model.md §8 fallback pattern. The 4-layer model is adequate
as long as ALL the following thresholds hold (≥3 thresholds):

1. **Layer expansion pressure**: ≤4 distinct layers needed across all
   surveyed users / contributor reports for ≥1 month sustained dogfood.
2. **Schema-merge complexity**: Zod `.merge()` operations stay within ≤4
   schemas chained per `ResolvedConfig` derivation; no need for runtime-driven
   schema composition.
3. **Resolution latency**: `LayeredResolver.resolve()` p99 latency <50ms on
   developer workstation per INV-S9 (invariants.md §INV-S9).
4. **Audit clarity**: an `orch config diagnose` command (v2.4 if needed) can
   print per-key originating-layer attribution in <1s.

If any threshold breaches sustained for ≥1 week of dogfood usage, v2.4
reconsiders adding a 5th layer (e.g., environment-derived overrides) OR a
richer override-DSL (e.g., conditional layers based on env). Until then,
4-layer model is binding.

## §9 Charter coherence

- **Charter §"Craft Philosophy"** (line 39): "Build for personal use first,
  team-share second" — Layer 1 alone is sufficient for personal use; Layers
  2-4 are opt-in team-share scaffolding.
- **Charter Principle 2** ("Tight scope", line 55): 4 layers is the smallest
  set that captures personal-machine + project-shared + per-checkout-private
  + system-defaults dimensions. No 5th layer added speculatively (YAGNI).
- **Charter Principle 3** ("Project-agnostic core", line 57): Layer 1 holds
  zero project-specific defaults; Layer 3 (existing `profile.yaml`) holds
  project-specific config. Layered resolver itself never references
  project-specific terms (I-2 invariant; grep guard in 8.7.6).
- **Charter Principle 8** ("Reusable without forking", line 67): community
  forks can extend `system-defaults.json` without touching code; user-config
  schema is documented via `~/.orch/config.yaml.example`; per-repo
  contributors author `profile.local.yaml` without committing.
- **Karpathy P1 (Think Before Coding)**: §1-§4 specifies the algorithm
  before any code; the architect output gates the implementer (§7).
- **Karpathy P2 (Simplicity First)**: deep-merge default + `!override`
  directive is the smallest set of merge primitives. NO custom DSL, NO
  conditional layers, NO runtime layer registration in v2.3.
- **Karpathy P3 (Surgical Changes)**: layered resolver lives in NEW file
  `packages/core/src/config/layered-resolver.ts`; existing `profile.ts`
  schema is FROZEN; no breaking changes.
- **I-1 (daemon-dumb)**: resolver is pure deterministic merge logic; zero
  LLM calls; zero external API dependencies.
- **I-2 (project-agnostic core)**: zero hardcoded project names in resolver
  or system-defaults; Layer 3 is the only place project-specific keys live.
- **I-10 (typed external input)**: each layer's input is Zod-validated
  before merge; bad input is rejected (default mode skips with warn; strict
  mode throws).
- **I-14 (no singleton state)**: resolver is instantiated per-call; no
  module-level mutable state.

## §10 Charter-coherence review checklist (for substage 8.7.6 reviewer)

≥5 items per Part-C gate convention (mirrors tenancy-model.md §10):

1. **Backwards-compat preservation**: Does an existing v2.2 install (only
   Layer 3 present) run identically?
   → **YES**. §5 mechanism + §4 Test #2 graceful-degradation behavior.

2. **Opt-in personal layers**: Do Layers 2 and 4 require explicit user
   action to be created?
   → **YES**. §1.2, §1.4. orch never authors these without `orch init`
   flow; missing-layer behavior is graceful skip per §2.3.

3. **Daemon-dumb compliance**: Does the resolver introduce any LLM call,
   external API, or non-deterministic decision?
   → **NO**. §3 pure deterministic merge; §9 I-1 invariant guard via grep
   in 8.7.6 acceptance.

4. **Decision 031 cross-binding**: Is `telemetry.*` enforced as user-scope
   only?
   → **YES**. §1.5 schema-table; §4 Test #6 acceptance test verifies
   project-scope `telemetry.enabled` is rejected at parse.

5. **Decision 030 ratification**: Is MIT confirmed without alternative
   surfacing?
   → **YES**. §6 explicit confirmation paragraph + Decision 030 cross-ref.

6. **Profile.yaml schema unchanged**: Does this introduce any breaking
   change to `packages/core/src/domain/profile.ts`?
   → **NO**. Layer 3 schema is the existing `ProfileSchema`, frozen for v2.3.
   8.7.1 has no authority to amend (per envelope constraint "DO NOT have
   authority to change profile-yaml schema").

7. **Cross-platform path support**: Does §1.2 cover POSIX, Windows,
   macOS-Unix, and XDG?
   → **YES**. §1.2 enumerates 4 path resolution paths in priority order;
   §4 Test #8 verifies behavior across all platforms.

8. **Strict-mode CI gating**: Is there a path for CI to fail-fast on bad
   config (vs. production graceful-skip)?
   → **YES**. §3 `mode: 'strict'` option; §4.9 (optional) test verifies.

9. **I-2 (project-agnostic) preserved**: Does any new file reference
   project-specific terms (e.g., "stockforge")?
   → **NO**. Layer 1 system defaults are project-agnostic; resolver is
   project-agnostic; Layer 3 is the appropriate home for project-specific
   keys (no change to existing rule).

10. **I-6 ABSOLUTE compliance**: Does this require autonomous git commits?
    → **NO**. Document authoring + future implementation are pure file
    writes; staging-only via existing 8.4/8.7.5 hygiene.

## §11 Cross-references

- **Decision 030** (`agent-workspace/memory/decisions/030-license-mit.md`):
  LICENSE = MIT. §6 of THIS doc ratifies without alternative.
- **Decision 031** (`agent-workspace/memory/decisions/031-telemetry-sync-wire-format.md`):
  telemetry config user-scope only; §1.2 + §1.5 + §4 Test #6 cross-bind.
- **Decision 029** (`agent-workspace/memory/decisions/029-tenancy-model-file-level.md`):
  user-scope tenancy is the highest-tenant identifier; aligns with this doc's
  Layer 2 user-scope authority.
- **Decision 028** (`agent-workspace/memory/decisions/028-config-style-normative-format.md`):
  binds frontmatter shape of THIS doc per `agent-workspace/constitution/`
  config-style scope.
- **tenancy-model.md** (`agent-workspace/constitution/tenancy-model.md`):
  §3 folder layout — when `ORCH_USER_ID` is set, Layer 4 path becomes
  `<project>/.orch/profile.local.yaml` UNDER the user-scoped project root
  (`agent-workspace/<user>/projects/<slug>/.orch/profile.local.yaml`).
  Backwards-compat shim §3.1 binds this doc's "default-user single-tier"
  fallback.
- **Master plan §3 8.7** (`agent-workspace/session-plans/pending/phase-8-v2.3-strategic-pivot.md`
  lines 146-156): substage decomposition — 8.7.1 (this doc) → 8.7.2 (impl)
  → 8.7.3 (telemetry seam) → 8.7.4 (OSS docs) → 8.7.5 (npm prep) → 8.7.6
  (triple review).
- **Master plan §10 D-D** (line 270-271): pre-bound LICENSE = MIT default.
- **Master plan §10 D-E** (line 271-272): pre-bound telemetry = JSONL/HTTPS;
  §1.2 user-scope binding aligns.
- **Research output 8.0.2** (`agent-workspace/research/phase-8-oss-config-patterns.md`):
  §S2 (4-scope layering survey) + §S6 R-1..R-7 (recommendations adopted).
- **PROJECT_CHARTER.md** §"Craft Philosophy" (line 39), Principle 2
  (line 55), Principle 3 (line 57), Principle 8 (line 67).
- **packages/core/src/domain/profile.ts**: existing `ProfileSchema` =
  Layer 3 schema; frozen for v2.3 backwards-compat (§5).
- **packages/core/src/config/defaults.ts**: existing const-export pattern;
  Layer 1 `system-defaults.json` mirrors but as JSON for ship-in-tarball.
- **invariants.md**: I-1 (daemon-dumb), I-2 (project-agnostic), I-10 (typed
  external input), I-14 (no singleton state) — §9 + §10 review checklist.
- **architecture.md** §"Domain layer": resolver in `packages/core/src/config/`
  imports zod + node:fs/path only; NO NestJS imports.

**END Config Layering Model.**
