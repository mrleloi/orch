# brainstorming — Sibling Self-Test

## Trigger

- User message contains "should we...", "what if...", "thinking about..."
- Start of a PLAN session with no existing phase plan in session-plans/pending/
- New feature request without a matching spec in specs/tier2-feature/
- User states a goal without acceptance criteria

## Expected behavior (PASS)

Skill activates; Read is the only tool allowed during activation. Assistant asks 3-5
Socratic scope-defining questions (not interrogation). No Write/Edit tool fires. After
user responds, skill produces a locked scope option and transitions to master-planner
OR writes a decisions/NNN-defer-<slug>.md if deferred.

## Named failure modes

- Mode F1: skill skipped — master-planner invoked directly on an exploratory "thinking about X" prompt without scope definition first
- Mode F2: >5 questions asked in a single activation turn (interrogation pattern, not Socratic)
- Mode F3: Write or Edit tool fires in the same turn as brainstorming activation (skill must block code edits until scope is locked)
- Mode F4: scope-locked output transitions directly to sandwich-dev or task-implementer, bypassing master-planner (Step 4 violation)

## Metrics

- activation_count_per_session: 0-2
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. component-telemetry.jsonl contains a record with component_name=brainstorming and outcome=ok for any session whose first user message matches the regex (should we|what if|thinking about|no acceptance criteria)
2. Transcript JSONL for every brainstorming-activated session contains NO Edit or Write tool_use entries between the brainstorming activation event and the next subagent dispatch event
3. On outcome=ok, within 5 hook events either a decisions/NNN-*.md file was written (grep agent-workspace/memory/decisions/) OR a master-planner Agent tool_use appears in the transcript JSONL
