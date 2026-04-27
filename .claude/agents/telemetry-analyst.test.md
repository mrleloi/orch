# telemetry-analyst — Sibling Test Contract

## Trigger

- A phase boundary is reached and `component-rollup-phase-<N>.md` exists in
  `agent-workspace/memory/`.
- Master-planner v3 Phase 0.5 reads prior-phase recommendations and the
  recommendations file is absent or stale — operator decides to re-run analyst.

## Expected Behavior

Analyst reads rollup table, applies exactly the 4 deterministic rules
(RULE-1 through RULE-4), and writes
`agent-workspace/memory/phase-<N>-routing-recommendations.md` containing
3 H2 sections. Every proposal bullet contains literal text
`cites rollup row: <type>::<name>`. Sections with no triggered rules contain
the placeholder `(no proposals at this time — all components within
thresholds)`. Returns structured YAML with `status: DONE`.

## Failure Modes

- MODE-1: Hallucinated proposal — proposal lacks `cites rollup row:` reference.
  Violates Phase 3 Phase 4 contract; caught by 6.2.5 citation linter.
- MODE-2: Over-eager pruning — agent with `count < 5` marked for prune.
  RULE-2 trigger requires `count >= 5`; smaller samples are statistically
  insufficient and must be ignored.
- MODE-3: Section omission — output file missing one of the 3 required H2
  sections (Model Bumps, Agent Prunes, Parallelization Gate Adjustments).
  Master-planner v3 Phase 0.5 grep for sections would fail.

## Metrics

- activation_count_per_phase: 1 (opt-in at phase boundary; not cron)
- token_cost_p99: TBD (Phase 6.2 baseline)
- duration_ms_p99: TBD (Phase 6.2 baseline)
- proposal_count_per_run: 0–N (depends on rollup data)

## Assertions

1. Every proposal in the output file contains literal text
   `cites rollup row: <type>::<name>` — verify by running the citation linter
   from `tests/integration/feedback-loop.spec.ts` (Case 3) against the
   produced recommendations file and asserting `violations.length === 0`.
2. Output file contains exactly 3 H2 sections (`## Model Bumps`,
   `## Agent Prunes`, `## Parallelization Gate Adjustments`) regardless of
   proposal count — verify with
   `grep -cE '^## (Model Bumps|Agent Prunes|Parallelization Gate Adjustments)$'
   <recommendations_path>` returning 3.
3. Empty rollup (0 component rows) or absent rollup produces a recommendations
   file where all 3 sections each contain the literal placeholder
   `(no proposals at this time — all components within thresholds)` —
   verify with `grep -c 'no proposals at this time' <recommendations_path>`
   returning 3, and `degraded_mode: true` in the returned YAML.
