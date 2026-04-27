---
title: Domain-Workflow Ontology (stub)
status: stub-normative
ratified_by: substage 8.7.1 (this brief) + Decision 027 §"Open question" 8.7.1
applies_to: agent-workspace/ontology/, packages/core/src/telemetry/, future <packages/core/src/domain/ontology/>
implementer: v2.4+ (stub only in v2.3)
authoring_substage: 8.7.1
phase: 8
binding_until: filled-in for ≥1 non-coding domain (v2.4+)
cross_references:
  - Decision 027 (Phase 8 strategic redirect — DIM 7 community/ontology mandate)
  - Decision 031 (telemetry sync — workflow-events-only schema; cross-binds §5 telemetry consumer)
  - config-layering.md §1 (Layer 1 system defaults; ontology rows live here in v2.4+)
  - tenancy-model.md §3 (per-user / per-project workspace structure binds domain assignment)
  - Charter Principle 2 (Tight scope — line 55)
  - Charter Principle 3 (Project-agnostic core — line 57)
  - Master plan §3 8.7.1 (ontology stub deliverable line 150)
  - Research output 8.0.2 §S5 (domain-workflow positioning lines 140-164)
---

# Domain-Workflow Ontology — stub

> Forward-looking ontology that establishes how orch will plug in
> non-coding domains (marketing, accounting, chat-support) in v2.4+ WITHOUT
> requiring code changes to the daemon. v2.3 ships this stub and the
> "coding" domain row only; the full schema is exercised when the second
> domain lands. Personal-first: orch today is purely a coding domain tool;
> the ontology seam is so the next contributor doesn't have to fork to
> add their domain.

## §1 Ontology scope

Orch is, at v2.3, a **coding-domain workflow orchestrator**. Every existing
substage (sessions, queue, hooks, tracing, sandwich-architect, etc.) assumes
the workflow surface "research → plan → implement → review → verify → debug"
that defines coding work.

The ontology stub exists because user brief §1.7 (cited in research 8.0.2 §S5)
positions orch as a "domain workflow autonomous knowledge expert" — orch
should be discoverable by, useful to, and extensible by contributors whose
primary domain is NOT coding. Marketing campaign workflows, accounting
ledger workflows, and chat-support workflows differ in artifact types,
review gates, and model preferences — but the SHAPE of "queue an autonomous
task; spawn a worker; verify; trace cost" is shared.

The ontology defines that shared shape. It is the data structure that
allows the daemon to remain dumb (I-1) while letting per-domain config
tell the worker which model + which gates + which artifacts apply.

**Scope of this stub document (v2.3)**:
- §2: domain row schema (the Zod-shaped data structure each domain provides).
- §3: the "coding" domain row, fully filled in.
- §4: stub rows for future domains (marketing, accounting, chat-support) —
  commented-out with placeholder fields, demonstrating extensibility.
- §5: ontology consumers (forward-looking; how 8.5 self-application + 8.7
  telemetry-sync seam read this ontology) — STUB only.
- §6: explicit non-goals (what the ontology is NOT).

**Out of scope for v2.3**:
- Implementation of `packages/core/src/domain/ontology/` resolver class.
- Per-domain `subagent_models` routing logic in dispatchers.
- Per-domain `gating_invariants` enforcement at session-start hook.
- Multi-domain telemetry-tag coexistence (single domain "coding" today).

These ship in v2.4 when the first non-coding domain has a real contributor
sponsor.

## §2 Domain row schema

Each domain is one row in the ontology. The row carries everything a
dispatcher needs to know to route a workflow_kind for that domain: which
model tier to spawn, which artifact types are expected, which invariants
gate session-end.

### §2.1 YAML representation

```yaml
# Canonical shape; v2.4+ serialization will live at packages/core/src/domain/ontology/domains.yaml
# v2.3 reference shape only.
domain:
  id: string                       # unique, kebab-case (e.g., "coding", "marketing", "accounting")
  display_name: string             # human-readable (e.g., "Software Engineering Workflow")
  workflow_kinds:                  # ordered list of supported workflow stages within this domain
    - string                       # each is a discrete stage: research, plan, implement, review, verify, debug
  subagent_models:                 # per-stage or per-domain model routing hints
    - kind: string                 # which workflow_kind this binding applies to (or "*" for all)
      model_id: string             # e.g., "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"
      fallback_model_id: string    # ccs / runtime fallback if primary unavailable
  primary_artifact_types:          # what this domain's tasks produce
    - string                       # e.g., code, test, document, dashboard, chart, report, ledger-entry, transcript
  gating_invariants:               # invariant IDs the daemon must check before declaring a task done
    - string                       # I-1 .. I-15, INV-S9, future domain-specific invariants
  cost_model_hint:                 # forward-looking; how cost is reported to user
    primary_unit: string           # "tokens", "dollars", "hours", "campaign-impressions"
    typical_session_budget: number # rough order-of-magnitude expected cost per session
```

### §2.2 Zod schema (v2.4+ implementer reference)

For substage 8.7.1 this is illustrative; v2.4 implements:

```typescript
// future packages/core/src/domain/ontology/domain-row.schema.ts
import { z } from 'zod';

export const WorkflowKindSchema = z.enum([
  'research',
  'plan',
  'implement',
  'review',
  'verify',
  'debug',
  // v2.4 additions: 'campaign-launch', 'reconciliation', 'triage', etc.
]);

export const SubagentModelBindingSchema = z.object({
  kind: z.union([WorkflowKindSchema, z.literal('*')]),
  model_id: z.string().min(1),
  fallback_model_id: z.string().min(1).optional(),
});

export const ArtifactTypeSchema = z.string().min(1).regex(/^[a-z][a-z0-9-]*$/);

export const DomainRowSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  display_name: z.string().min(1),
  workflow_kinds: z.array(WorkflowKindSchema).min(1),
  subagent_models: z.array(SubagentModelBindingSchema).min(1),
  primary_artifact_types: z.array(ArtifactTypeSchema).min(1),
  gating_invariants: z.array(z.string().regex(/^(I-\d+|INV-[A-Z0-9]+)$/)),
  cost_model_hint: z.object({
    primary_unit: z.string(),
    typical_session_budget: z.number().positive(),
  }).optional(),
});

export type DomainRow = z.infer<typeof DomainRowSchema>;
```

(The schema is NOT shipped in v2.3 — only this reference. v2.4 adds
`packages/core/src/domain/ontology/` with the schema + `coding` row + a
loader that reads from `<package>/dist/ontology/domains.yaml`.)

## §3 The "coding" domain row (the only filled-in row in v2.3)

This is the canonical row representing orch's CURRENT operating domain.
v2.3 dispatchers operate AS IF this row exists implicitly (every model
routing today maps to the coding domain).

```yaml
domain:
  id: "coding"
  display_name: "Software Engineering Workflow"
  workflow_kinds:
    - research                     # research-scanner subagent
    - plan                         # master-planner / sandwich-architect subagents
    - implement                    # task-implementer / sandwich-dev subagents
    - review                       # spec-compliance-reviewer / code-quality-reviewer subagents
    - verify                       # sandwich-verifier subagent
    - debug                        # systematic-debugger subagent
  subagent_models:
    - kind: research
      model_id: claude-sonnet-4-6
      fallback_model_id: claude-haiku-4-5
    - kind: plan
      model_id: claude-opus-4-7    # high-leverage architecture decisions
      fallback_model_id: claude-sonnet-4-6
    - kind: implement
      model_id: claude-sonnet-4-6  # bulk implementation
      fallback_model_id: claude-haiku-4-5
    - kind: review
      model_id: claude-sonnet-4-6
      fallback_model_id: claude-haiku-4-5
    - kind: verify
      model_id: claude-opus-4-7    # adversarial review needs strongest reasoning
      fallback_model_id: claude-sonnet-4-6
    - kind: debug
      model_id: claude-opus-4-7    # systematic debugging benefits from deeper reasoning
      fallback_model_id: claude-sonnet-4-6
  primary_artifact_types:
    - code                         # source files (.ts, .py, .go, etc.)
    - test                         # *.spec.ts, *.test.py, etc.
    - document                     # markdown specs, decisions, session plans
    - configuration                # YAML, JSON, .env templates
  gating_invariants:
    - I-1                          # daemon-dumb (no LLM in core state machine)
    - I-2                          # project-agnostic core
    - I-3                          # CLI subprocess path (ToS safety)
    - I-4                          # one-way dependency (managed projects don't import orch)
    - I-5                          # credentials isolation
    - I-6                          # destructive ops require confirmation
    - I-7                          # localhost default for Web UI
    - I-8                          # idempotent hook receivers
    - I-9                          # structured logging with trace correlation
    - I-10                         # typed external input (Zod everywhere)
    - I-11                         # no silent state transitions
    - I-12                         # adapter failure isolation
    - I-13                         # test isolation
    - I-14                         # no singleton state outside DI
    - I-15                         # token budget instrumentation
    - INV-S9                       # skills/agents/hooks latency budget
  cost_model_hint:
    primary_unit: tokens
    typical_session_budget: 85000  # per master plan §6 budget table avg ~85K/session at v2.3
```

### §3.1 How v2.3 dispatchers consume this row (implicit today)

- `task-implementer` subagent dispatch (sandwich-dev / sandwich-architect):
  reads `subagent_models[kind=implement]` and routes to `claude-sonnet-4-6`.
  v2.3 implementation has this hardcoded; v2.4 reads from ontology.
- `master-planner` subagent: `subagent_models[kind=plan]` → `claude-opus-4-7`.
- `sandwich-verifier`: `subagent_models[kind=verify]` → `claude-opus-4-7`.
- Session-end hook: enumerates `gating_invariants` and runs the `grep` /
  test-suite checks for each before marking task DONE. v2.3 implementation
  has this hardcoded in `verification-before-completion` skill; v2.4 reads
  from ontology.
- Trace tags: `orch.session` span attribute `domain.id = "coding"` — v2.3
  implicit; v2.4 explicit per ontology lookup.

The forward-looking change in v2.4 is removing the implicit / hardcoded
behavior in favor of a `DomainOntologyService` lookup at dispatch time.
v2.3 ships the schema + this row; v2.4 ships the service + replaces the
hardcoded paths.

## §4 Future domains (stub rows; commented-out)

These rows are NOT YET ACTIVE in v2.3. They are commented-out placeholders
demonstrating that the schema generalizes. A real contributor wanting to
add their domain in v2.4+ uses these as templates.

### §4.1 Marketing domain (stub)

```yaml
# Activated when first marketing-domain contributor lands a working
# managed-project. Not active in v2.3.
#
# domain:
#   id: "marketing"
#   display_name: "Marketing Campaign Workflow"
#   workflow_kinds:
#     - research                     # competitive analysis, audience research
#     - plan                         # campaign brief, channel strategy
#     - implement                    # asset creation (copy, creative, landing pages)
#     - review                       # brand-compliance, legal-review
#     - verify                       # A/B test setup verification, tracking-pixel sanity
#     - debug                        # post-launch troubleshooting
#   subagent_models:
#     - kind: implement
#       model_id: claude-sonnet-4-6    # creative copy benefits from sonnet's writing
#       fallback_model_id: claude-haiku-4-5
#     - kind: review
#       model_id: claude-opus-4-7      # brand/legal review = high-stakes
#       fallback_model_id: claude-sonnet-4-6
#   primary_artifact_types:
#     - copy                            # ad text, email sequences, social posts
#     - creative-brief                  # campaign documents
#     - tracking-config                 # analytics/pixel setup files
#     - dashboard                       # campaign-monitoring dashboards
#   gating_invariants:
#     - I-1                             # daemon-dumb still applies
#     - I-2                             # project-agnostic still applies
#     - I-10                            # typed external input
#     - INV-MKT-1                       # (future) brand-voice-guideline-conformance check
#     - INV-MKT-2                       # (future) tracking-pixel-attached check
#   cost_model_hint:
#     primary_unit: tokens
#     typical_session_budget: 50000     # campaigns typically smaller than coding tasks
```

### §4.2 Accounting domain (stub)

```yaml
# Activated when first accounting-domain contributor lands. Not active in v2.3.
#
# domain:
#   id: "accounting"
#   display_name: "Financial Reconciliation Workflow"
#   workflow_kinds:
#     - research                     # transaction discovery, account mapping
#     - reconciliation               # NEW workflow_kind for this domain
#     - review                       # journal-entry sanity check
#     - verify                       # GL balance verification
#     - debug                        # variance investigation
#   subagent_models:
#     - kind: reconciliation
#       model_id: claude-opus-4-7      # numerical reasoning + audit trail = opus
#       fallback_model_id: claude-sonnet-4-6
#     - kind: review
#       model_id: claude-opus-4-7      # GAAP/audit context demands opus
#   primary_artifact_types:
#     - ledger-entry                    # journal entries, adjusting entries
#     - reconciliation-report           # bank rec, account rec
#     - audit-trail                     # supporting documentation files
#     - financial-statement             # P&L, BS, cash flow drafts
#   gating_invariants:
#     - I-1                             # daemon-dumb
#     - I-10                            # typed external input
#     - INV-ACCT-1                      # (future) double-entry-balanced check
#     - INV-ACCT-2                      # (future) audit-trail-completeness check
#     - INV-ACCT-3                      # (future) PII-redaction (SSN, account numbers)
#   cost_model_hint:
#     primary_unit: tokens
#     typical_session_budget: 100000    # reconciliation sessions tend to be larger
```

### §4.3 Chat-support domain (stub)

```yaml
# Activated when first chat-support-domain contributor lands. Not active in v2.3.
#
# domain:
#   id: "chat-support"
#   display_name: "Customer Support Workflow"
#   workflow_kinds:
#     - triage                       # NEW workflow_kind: classify incoming ticket
#     - research                     # KB / past-ticket lookup
#     - implement                    # draft response
#     - review                       # tone / accuracy check
#     - verify                       # response sent + ticket-closed verification
#   subagent_models:
#     - kind: triage
#       model_id: claude-haiku-4-5     # cheap fast triage
#     - kind: implement
#       model_id: claude-sonnet-4-6    # response drafting
#     - kind: review
#       model_id: claude-sonnet-4-6
#   primary_artifact_types:
#     - response-draft                  # customer-facing reply text
#     - kb-article-citation             # internal KB references used
#     - escalation-note                 # when escalating to human
#     - ticket-resolution               # final close-out with summary
#   gating_invariants:
#     - I-1                             # daemon-dumb
#     - I-10                            # typed external input
#     - INV-CS-1                        # (future) PII-redaction (customer email/phone)
#     - INV-CS-2                        # (future) escalation-path-respected check
#   cost_model_hint:
#     primary_unit: tokens
#     typical_session_budget: 15000     # support sessions are short
```

## §5 Ontology consumers (forward-looking)

How v2.4+ subsystems read the ontology. v2.3 stubs the seam; v2.4 implements.

### §5.1 8.5 self-application (dogfooding)

When orch dispatches its OWN tasks (per substage 8.5 self-application
milestones), the dispatcher tags the trace with the originating domain:

```typescript
// future packages/core/src/dogfood/run-self-task.ts
const domain = ontology.lookup('coding');               // orch self-tasks ARE coding
span.setAttribute('domain.id', domain.id);              // 'coding'
span.setAttribute('workflow.kind', task.workflow_kind); // e.g., 'implement'
span.setAttribute('expected.model', domain.subagent_models.find(b => b.kind === task.workflow_kind).model_id);
```

This lets the operator (or a future dashboard) filter traces by domain
when multi-domain dogfooding happens (v2.5+; orch dogfoods accounting on
itself by treating its OWN ledger of token-spend as an accounting workflow).

### §5.2 8.7 telemetry sync seam (Decision 031)

The opt-in upstream telemetry sync (Decision 031) tags every NDJSON event
with `payload.domain_id` so the upstream collector can analyze workflow
patterns BY DOMAIN without seeing project-specific content:

```ndjson
{"ts":"2026-04-27T10:00:00.000Z","project_id_hash":"a3f5...","event_type":"orch.task.completed","payload":{"domain_id":"coding","workflow_kind":"implement","tokens_in":12345,"tokens_out":6789,"retry_count":0}}
```

In v2.4, `domain_id` is read from the ontology lookup at dispatch time. In
v2.3, the field is hardcoded to `"coding"` in the sync-seam (substage 8.7.3)
because that is the only domain orch supports. This is a documented
forward-extensible field — the schema accepts arbitrary `domain_id`; only
the lookup is hardcoded.

### §5.3 Model routing decisions (8.4 effort routing)

v2.4 effort-routing dispatcher (`scripts/dispatch/...`) reads
`domain.subagent_models` to decide which `--model` flag to pass to
`claude` CLI subprocess. v2.3 has the routing hardcoded in
`agent-workspace/constitution/model-routing.md`; v2.4 makes the constitution
file the human-readable mirror of the ontology row.

### §5.4 Gate selection at session-end

v2.4 session-end hook reads `domain.gating_invariants` and runs each gate
script before marking task DONE. v2.3 has this hardcoded in
`.claude/skills/verification-before-completion/SKILL.md`; v2.4 makes the
skill read from the ontology.

### §5.5 Trace span tagging

v2.4 OTEL pipeline (existing `packages/core/src/modules/tracing/`) adds
`domain.id` as a top-level trace attribute. v2.3 omits this (single-domain
implicit "coding"); v2.4 adds when multi-domain becomes real.

## §6 Explicit non-goals

The ontology stub is intentionally LIMITED to avoid speculative complexity:

1. **NOT a generic taxonomy framework**. We are not building Wikidata.
   Each domain row is a flat data record; no hierarchies, no inheritance,
   no cross-domain references in v2.3.

2. **NOT a model marketplace**. `subagent_models` lists model IDs; it does
   NOT track pricing, availability, or capability matrices. Those live in
   `packages/core/src/config/model-pricing.ts` (existing) and per-runtime
   adapter introspection.

3. **NOT a gate-rule DSL**. `gating_invariants` lists invariant IDs only;
   the actual gate logic lives in `agent-workspace/constitution/invariants.md`
   + the gate scripts. The ontology refers; it does not embed.

4. **NOT a workflow engine**. `workflow_kinds` is a flat list. We are NOT
   modeling state-machine transitions between kinds (that's the domain of
   each workflow's own subagent dispatch graph in
   `.claude/skills/subagent-driven-development/SKILL.md`).

5. **NOT a multi-tenant routing primitive**. Tenancy is handled by
   `tenancy-model.md`; ontology is per-domain, not per-user. A user with
   multiple domains uses multiple ontology rows; the user-scope is
   orthogonal.

6. **NOT shipping with v2.3 implementation**. Only the schema + the
   "coding" row + the stub other-domain rows ship in v2.3. The
   `DomainOntologyService` consumer code is v2.4 work.

## §7 v2.4+ implementation roadmap (informational)

Listed here so the v2.4 architect has a clear inheritance:

- **v2.4 substage**: implement `packages/core/src/domain/ontology/`
  containing `domain-row.schema.ts` (Zod), `domains.yaml` (the stored
  ontology), `domain-ontology.service.ts` (lookup), `domain-ontology.spec.ts`
  (tests).
- **v2.4 substage**: replace hardcoded model routing in dispatchers with
  `ontology.lookup(domainId).subagent_models[kind]`.
- **v2.4 substage**: add `domain.id` to OTEL trace attributes via
  `packages/core/src/modules/tracing/` middleware.
- **v2.4 substage**: telemetry sync (`sync-seam.ts`) reads ontology for
  `domain_id` field instead of hardcoded `"coding"`.
- **v2.5+ substage**: first non-coding domain contributor lands; second
  ontology row added; multi-domain telemetry-tag coexistence verified.

## §8 Charter coherence

- **Charter Principle 2** ("Tight scope", line 55): v2.3 ontology covers
  EXACTLY one domain (coding). No speculative implementation. Stub rows
  are commented-out demonstrations only.
- **Charter Principle 3** ("Project-agnostic core", line 57): no
  project-specific terms in any ontology row. Domains are categories of
  WORK; projects are instances within a domain.
- **Charter Principle 8** ("Reusable without forking", line 67): the
  ontology stub IS the seam that lets contributors add their domain
  without forking. v2.4 implementation lands the seam in code; v2.3 lands
  the schema + first row.
- **Karpathy P1 (Think Before Coding)**: full schema + 1 filled row + 3
  stub rows + consumer-list before any code lands. Architect-only artifact.
- **Karpathy P2 (Simplicity First)**: ontology is a flat list of domain
  rows. No graph, no inheritance, no multi-version evolution path in v2.3.
- **I-1 (daemon-dumb)**: ontology lookup is pure deterministic data read.
  Zero LLM logic. Zero state mutation. Zero non-determinism.
- **I-2 (project-agnostic)**: ontology is by-domain, not by-project. v2.3
  + v2.4 grep guards for "stockforge" in `packages/core/src/domain/
  ontology/` continue to return zero hits.
- **Decision 027 §"Open question"**: 8.7.1 brief ratifies ontology as a
  v2.3-stub / v2.4-implement deliverable; this document is the stub.
- **Decision 031 cross-binding**: §5.2 telemetry sync seam will read
  `domain.id` from ontology; v2.3 hardcodes `"coding"` per single-domain
  scope; v2.4 lookup replaces.

## §9 Cross-references

- **Decision 027** (`agent-workspace/memory/decisions/027-phase-8-strategic-redirect-2026-04-27.md`):
  Phase 8 strategic redirect — DIM 7 community/ontology mandate; this stub
  satisfies the §"Open question" 8.7.1 ontology deliverable.
- **Decision 031** (`agent-workspace/memory/decisions/031-telemetry-sync-wire-format.md`):
  telemetry NDJSON schema; §5.2 cross-binds the future `domain_id` field.
- **config-layering.md** (`agent-workspace/constitution/config-layering.md`):
  §1 Layer 1 system defaults — v2.4+ ontology rows ship as part of this
  layer (`packages/core/src/domain/ontology/domains.yaml`).
- **tenancy-model.md** (`agent-workspace/constitution/tenancy-model.md`):
  per-user / per-project workspace structure; ontology is orthogonal to
  tenancy (per-domain, not per-user).
- **model-routing.md** (`agent-workspace/constitution/model-routing.md`):
  v2.3 human-readable mirror of `subagent_models` for the coding domain.
  v2.4 ontology becomes single source of truth; model-routing.md becomes
  human commentary on the YAML.
- **invariants.md** (`agent-workspace/constitution/invariants.md`):
  I-1 through I-15 + INV-S9 enumerated in §3 `gating_invariants` for the
  coding domain row.
- **PROJECT_CHARTER.md** Principles 2, 3, 8 (lines 55, 57, 67).
- **research output 8.0.2** (`agent-workspace/research/phase-8-oss-config-patterns.md`):
  §S5 lines 140-164 — domain-workflow positioning prior-art gap; this stub
  establishes orch's claim to that position by shipping the schema first.
- **Master plan §3 8.7.1** (`agent-workspace/session-plans/pending/
  phase-8-v2.3-strategic-pivot.md` line 150): "ontology stub structure"
  deliverable.
- **packages/core/src/domain/profile.ts**: existing project-shape; v2.4
  ontology may add `profile.domain_id?: string` (optional, default
  "coding") — that addition is v2.4 work, NOT v2.3.

**END Domain-Workflow Ontology stub.**
