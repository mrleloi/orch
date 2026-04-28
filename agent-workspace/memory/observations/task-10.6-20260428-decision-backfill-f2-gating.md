# Task 10.6 — Decision-doc backfill + F-2 self-evolution gating

## Status
DONE

## Files Changed
- `agent-workspace/memory/decisions/032-effort-routing.md` (created, 80 lines)
- `agent-workspace/memory/decisions/033-sc39-narrow-gate-supersession.md` (created, 110 lines)
- `agent-workspace/memory/audits/f2-self-evolution-disposition-v2.5.md` (created, 80 lines)
- `agent-workspace/memory/decisions/README.md` (no changes needed — entries were pre-populated)
- `agent-workspace/memory/sessions/2026-04-28-task-10.6-decision-backfill-f2-gating.md` (created)
- `agent-workspace/memory/observations/task-10.6-20260428-decision-backfill-f2-gating.md` (this file)

## Tests Added
None — doc-only task; no code changes.

## Gates
- typecheck: N/A (no code changes)
- lint: N/A (no code changes)
- test: N/A (no code changes)
- invariants: PASS — README has no unresolved phantom citations (grep confirms empty)

## Deviations from Plan
- README already had pre-populated entries for 032 and 033 with "backfilled 2026-04-28 substage 10.6" 
  status markers. No README edit was needed; files were simply created to match the already-accurate index.

## Concerns
None.

## Assumptions Made

### Decision 032 — effort routing (BACKFILL)
1. The slot 032 migration from "sc39-retry-or-defer" (Phase 8 plan) to "effort routing"
   (Phase 9+ usage) happened during Phase 9 master-planner planning and was never
   explicitly documented. Backfill treats the Phase 9+ usage as authoritative since
   that is what 8+ downstream files cite consistently.
2. D1-D6 clause labels are reconstructed from plan text. The original decision file
   may have used different section headings — the content is faithful; the labels
   are editorial.
3. The Phase 8 SC-39 verdict function (originally planned for slot 032 per §8.8.1)
   was re-homed to slot 033 during Phase 9 planning. The backfill notes this migration.

### Decision 033 — SC-39 narrow gate (BACKFILL)
1. Decision 034 is the primary source for Decision 033's content since 034 quotes
   033's key clauses verbatim. Backfill reliability is high because 034's author
   cited 033's §"Deliberation E" constraint as the reason ENABLE_RETRY was foreclosed.
2. The Deliberations A/B/C/D labeling is editorial. The content is accurate per
   all citing documents.
3. Status "superseded-by-034" is unambiguous — Decision 034 §"Supersedes" header
   states this explicitly.

### F-2 disposition
1. The "if DEFER-V2.6, defer F-2" logic is stated in Decision 034 §Consequences item 4,
   Decision 035 §8 item 4, and Phase 10 plan §4 deferral list item 3. The decision
   is mechanical given the binding DEFER-V2.6 verdict from Decision 035.
2. The f2-signal-extension-spec.md file is explicitly NOT created per spec line 211.
