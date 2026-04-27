# spawned-session-mode self-test

## Trigger

Code path checks `ORCH_SPAWNED` env to branch interactive vs autonomous behavior; OR any
command, skill, or subagent that would otherwise call `AskUserQuestion`, show a confirmation
prompt, or block on stdin; OR a destructive op normally gated by I-6 confirmation when the
session is running spawned (e.g. terminate-session, delete-queue-item, force-account-switch).

## Expected Behavior

When `ORCH_SPAWNED=true`: skill suppresses `AskUserQuestion`, resolves ambiguity via charter
principles + decisions/NNN-*.md log, and ends with a structured YAML completion block parseable
by the orchestrator (fields: status, produced_files, decisions_made, next_action). I-6
destructive ops remain gated; a pre-authorized flag in the task envelope REPLACES (does not
REMOVE) the interactive confirmation.

## Failure Modes

- F1: `AskUserQuestion` invoked while `ORCH_SPAWNED=true` (silent loop-break; daemon hangs
  indefinitely waiting for a response from nobody)
- F2: I-6 destructive op bypassed under "ORCH_SPAWNED=true means skip confirmation"
  rationalization (forbidden; pre-authorized flag REPLACES, does not REMOVE, the gate)
- F3: completion report emitted as prose narration instead of structured YAML block
  (orchestrator cannot parse prose; task appears BLOCKED from daemon's perspective)

## Metrics

- activation_count_per_session: 0-1 (binary env check)
- success_rate: TBD (Phase 5.5)
- token_cost_p50: TBD (Phase 5.5)
- duration_ms_p50: TBD (Phase 5.5)

## Assertions

1. ANY session with `ORCH_SPAWNED=true` MUST end with a YAML block matching the architect
   §3.7 schema (status, produced_files, decisions_made, next_action); verify by grepping the
   transcript tail for the literal string `status: DONE` OR `status: BLOCKED` inside a
   fenced `---` block within the final 20 lines of the session JSONL.
2. NO `AskUserQuestion` tool_use occurs in any transcript JSONL where the session env had
   `ORCH_SPAWNED=true`; grep: `jq 'select(.tool_use.name=="AskUserQuestion")' <transcript>`
   must return zero results for every spawned-session transcript.
3. Destructive ops (terminate-session, delete-queue-item, force-account-switch) fired during a
   spawned session MUST have a corresponding `allow_<op>: true` key in the task envelope JSON;
   audit by cross-referencing op-fire events in component-telemetry.jsonl against the task
   envelope stored in agent-workspace/memory/ for that session.
