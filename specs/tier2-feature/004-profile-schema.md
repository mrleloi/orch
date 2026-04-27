---
spec_id: SPEC-2026-04-24-T2-004
tier: 2
status: approved
version: 1.0
created: 2026-04-24
related_specs: [SPEC-2026-04-24-T1-001]
---

# SPEC T2-004: Profile Schema & Project Registry

# PART A — BUSINESS SPECIFICATION

## A.1 Context

A profile (`.orch/profile.yaml`) is how a project declares itself to Orch. It's the sole integration surface. No code. Safe to commit to the project's repo.

The ProjectRegistry loads profiles at startup, watches them for changes, resolves profile-dependent behavior throughout the daemon.

## A.2 Profile File Lifecycle

1. User runs `orch attach <path>` → CLI generates `.orch/profile.yaml` interactively
2. User may edit manually
3. Orch daemon watches `.orch/profile.yaml` → reloads on change (hot)
4. User runs `orch detach <path>` → CLI removes `.orch/profile.yaml`

## A.3 Security

- Profile is data-only — no executable code, no shell commands beyond documented command keys
- Profile may reference env vars: `${ORCH_TELEGRAM_CHAT_ID}` — resolved at load time
- Secrets NEVER in profile (Invariant check) — only env or `.orch/secrets.yaml` (local, gitignored)

---

# PART B — AGENT CONTRACT

## B.1 Profile Schema (YAML, v1.0)

Full schema:

```yaml
# .orch/profile.yaml
schemaVersion: "1.0"   # required, used for migration

name: stockforge       # required, unique across managed projects, slug format
path: ${PROJECT_PATH}  # required, absolute (may reference env)
description: |         # optional
  StockForge investment advisor project.

# Runtime: which agent CLI is used
runtime:
  adapter: claude-code     # required: claude-code | codex
  binary: claude           # optional, default per adapter
  ccs_enabled: true        # optional, default true for claude-code adapter
  extra_args: []           # optional, passed to every invocation

# ccs profile configuration (used if ccs_enabled)
ccs:
  primary: pro             # profile name from ccs
  fallback: [work, backup] # other profiles to use on quota exhaustion
  auto_failover: true      # let ccs auto-switch, default true

# Session types this project recognizes
# Names must match what this project's own constitution uses
session_types:
  - name: PLAN
    budget_tokens: 80000
  - name: FOCUSED_IMPL
    budget_tokens: 150000
  - name: MULTI_TASK_IMPL
    budget_tokens: 250000
  - name: VERIFY
    budget_tokens: 60000
  - name: THESIS
    budget_tokens: 100000
  - name: INGEST
    budget_tokens: 80000
  - name: POST_MORTEM
    budget_tokens: 50000

# Cross-session-type rules (project's constitution)
session_type_rules:
  # Cannot mix these two within same session
  no_mix:
    - [PLAN, FOCUSED_IMPL]
    - [PLAN, MULTI_TASK_IMPL]
  # Must follow this sequence (warning, not block)
  recommended_sequence:
    - PLAN
    - FOCUSED_IMPL | MULTI_TASK_IMPL
    - VERIFY

# Queue sources
queue:
  sources:
    - type: file_watcher
      path: agent-workspace/session-plans/pending
      pattern: "*.md"
      priority_field: priority   # YAML frontmatter field for priority
    - type: telegram
      enabled: true
    - type: webhook
      path: /enqueue

# Slash commands in the project (used by handoff / enforcement)
commands:
  session_start: /session-start
  session_end: /session-end
  master_plan: /master-plan
  drift_check: /drift-check

# Hook injection target
hooks:
  inject_into: .claude/settings.json
  events: [SessionStart, SessionEnd, Stop, SubagentStop]  # which to wire

# Context policy
context_policy:
  warn_at_tokens: 200000
  force_handoff_at_tokens: 230000
  handoff_strategy: session-log   # session-log | git-diff | both

# Budget policy
budget:
  daily_tokens_max: 5000000
  per_session_tokens_max: 250000
  alert_on_breach: true
  reset_timezone: UTC

# Notifications
notifications:
  telegram:
    chat_id: ${ORCH_STOCKFORGE_TG_CHAT}  # env var ref
    events:
      - session_end
      - session_failed
      - rate_limited
      - context_near_limit
      - budget_warning
      - queue_empty
  web_ui: true

# Observability
observability:
  otel_enabled: true
  langfuse_project_name: stockforge  # optional, tags traces
  service_name: orch-stockforge

# Retries
retries:
  max_attempts: 3
  backoff_seconds: [30, 300, 1800]  # 30s, 5min, 30min

# Advanced (optional)
advanced:
  watchdog_timeout_seconds: 1800  # default 30 min
  concurrent_sessions: 1           # v1: always 1 per project
  memory_path: agent-workspace/memory  # where project keeps its memory
```

## B.2 Zod Schema (TypeScript)

```typescript
export const profileSchema = z.object({
  schemaVersion: z.literal('1.0'),
  name: z.string().regex(/^[a-z0-9-]+$/),
  path: z.string(),
  description: z.string().optional(),

  runtime: z.object({
    adapter: z.enum(['claude-code', 'codex']),
    binary: z.string().optional(),
    ccs_enabled: z.boolean().default(true),
    extra_args: z.array(z.string()).default([]),
  }),

  ccs: z.object({
    primary: z.string(),
    fallback: z.array(z.string()).default([]),
    auto_failover: z.boolean().default(true),
  }).optional(),

  session_types: z.array(z.object({
    name: z.string(),
    budget_tokens: z.number().int().positive(),
  })).min(1),

  session_type_rules: z.object({
    no_mix: z.array(z.tuple([z.string(), z.string()])).default([]),
    recommended_sequence: z.array(z.string()).default([]),
  }).default({}),

  queue: z.object({
    sources: z.array(z.discriminatedUnion('type', [
      z.object({
        type: z.literal('file_watcher'),
        path: z.string(),
        pattern: z.string().default('*.md'),
        priority_field: z.string().default('priority'),
      }),
      z.object({
        type: z.literal('telegram'),
        enabled: z.boolean().default(true),
      }),
      z.object({
        type: z.literal('webhook'),
        path: z.string(),
      }),
    ])).min(1),
  }),

  commands: z.record(z.string(), z.string()).default({}),

  hooks: z.object({
    inject_into: z.string().default('.claude/settings.json'),
    events: z.array(z.string()).default(['SessionStart', 'SessionEnd', 'Stop', 'SubagentStop']),
  }),

  context_policy: z.object({
    warn_at_tokens: z.number().int().positive().default(200000),
    force_handoff_at_tokens: z.number().int().positive().default(230000),
    handoff_strategy: z.enum(['session-log', 'git-diff', 'both']).default('session-log'),
  }).default({}),

  budget: z.object({
    daily_tokens_max: z.number().int().positive().default(5000000),
    per_session_tokens_max: z.number().int().positive().default(250000),
    alert_on_breach: z.boolean().default(true),
    reset_timezone: z.string().default('UTC'),
  }).default({}),

  notifications: z.object({
    telegram: z.object({
      chat_id: z.string().optional(),
      events: z.array(z.string()).default([]),
    }).optional(),
    web_ui: z.boolean().default(true),
  }).default({}),

  observability: z.object({
    otel_enabled: z.boolean().default(true),
    langfuse_project_name: z.string().optional(),
    service_name: z.string().optional(),
  }).default({}),

  retries: z.object({
    max_attempts: z.number().int().positive().default(3),
    backoff_seconds: z.array(z.number().int().positive()).default([30, 300, 1800]),
  }).default({}),

  advanced: z.object({
    watchdog_timeout_seconds: z.number().int().positive().default(1800),
    concurrent_sessions: z.literal(1).default(1),  // v1 constraint
    memory_path: z.string().default('agent-workspace/memory'),
  }).default({}),
});

export type Profile = z.infer<typeof profileSchema>;
```

## B.3 Env Var Resolution

Profiles may reference env vars:
- `${VAR_NAME}` — required, throw if undefined
- `${VAR_NAME:default}` — optional with default

Resolved at load time. Unresolved → error.

## B.4 ProjectRegistryService API

```typescript
class ProjectRegistryService {
  // Load all profiles from configured paths
  async loadAll(): Promise<Profile[]>;

  // Get a specific profile by name
  getProject(name: string): Profile | undefined;

  // List all registered
  listProjects(): Profile[];

  // Watch for changes (emits events)
  startWatching(): void;
  stopWatching(): void;

  // Programmatic (for `orch attach` CLI)
  async registerProject(profile: Profile): Promise<void>;
  async unregisterProject(name: string): Promise<void>;
}
```

Events emitted:
- `project.registered(profile)`
- `project.updated(oldProfile, newProfile)` — emitted on hot reload
- `project.removed(name)`
- `project.validation_failed(path, error)` — bad profile, kept out of registry

## B.5 Profile Discovery

On daemon start:
1. Read `~/.orch/projects.yaml` (a list of registered project paths)
2. For each path, load `<path>/.orch/profile.yaml`
3. Validate, register

`orch attach <path>` adds to `~/.orch/projects.yaml`. `orch detach <path>` removes.

`~/.orch/projects.yaml`:
```yaml
projects:
  - path: /home/user/stockforge
    enabled: true
  - path: /home/user/otherproject
    enabled: true
```

## B.6 Hot Reload Rules

When profile.yaml changes:
- If validation fails → keep old version, emit warning, notify via Telegram
- If validation succeeds → swap in memory, emit `project.updated`
- Running sessions: NOT affected (use snapshot of profile at spawn time)
- Queued items: apply new config to next spawn

## B.7 Snapshot Behavior

When a session starts, capture current profile as snapshot in `Session.profile_snapshot` (JSON). Running session uses snapshot, not live profile. This prevents "profile changed mid-session → inconsistent behavior".

## B.8 Migrations (future-proofing)

Not needed in v1. When schema v2.0 ships:
- Detect `schemaVersion` field
- Run migration function from v1.0 → v2.0 at load time
- Write back if user consents
- Log migration

## B.9 Tests

- Unit: valid profile parses correctly
- Unit: invalid profiles rejected with readable errors (missing fields, wrong types, unknown session types referenced in rules)
- Unit: env var resolution (required, optional, missing)
- Unit: session_type_rules reference unknown types → error
- Integration: file watcher hot reload
- Integration: multi-project load
- Integration: profile change mid-session doesn't affect running session (snapshot)
