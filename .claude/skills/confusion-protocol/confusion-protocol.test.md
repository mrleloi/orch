# confusion-protocol — Sibling Self-Test

## Trigger

- Assistant detects "spec says X but might mean Y"
- Conflicting invariants (e.g., charter principle vs. T2 spec section)
- "I'm not sure which module owns this responsibility"
- Two adapters could handle the same task — picking one without justification
- A *feeling* of ambiguity rather than a deterministic check failure

## Expected Behavior

Skill activates -> STOP coding. Name the confusion in one sentence. Audit sources
(charter, invariants, spec, decisions/, code precedent). If interactive: ask user.
If ORCH_SPAWNED=true: write `decisions/NNN-*.md` with options, decision, rationale,
reversibility, and proceed. If sources conflict OR reversibility=hard: write
`escalation.md` and HALT.

## Failure Modes

- F1: silent guess — assistant proceeds without writing decision log or escalation.md
- F2: TODO comment substituted for decision log (Red Flag: "TODOs rot; confusion-protocol demands action now")
- F3: hard-reversibility decision made without escalation.md (Step 4 violation)
- F4: "autonomous mode means I should just decide" rationalization — decision made without any documentation trail

## Metrics

- activation_count_per_session: 0-3
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. When `component_name=confusion-protocol` `outcome=ok`, EITHER
   `agent-workspace/memory/decisions/NNN-*.md` was written within 10 hook events
   OR an `escalation.md` was written — grep component-telemetry.jsonl for the
   activation event, then check decisions/ dir mtime within same window.
2. NO TODO-only commits in any session that activated this skill — grep the git
   diff for lines matching `^\+.*TODO` that lack a companion `decisions/` entry
   created in the same session window.
3. ORCH_SPAWNED=true sessions with confusion activations MUST produce a
   `decisions/NNN-*.md` file — interactive AskUserQuestion is forbidden in
   spawned mode; grep transcript JSONL for AskUserQuestion tool_use with
   ORCH_SPAWNED=true in env; count must be zero.
