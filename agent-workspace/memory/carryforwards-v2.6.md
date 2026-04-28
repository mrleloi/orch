# Carryforwards — v2.6

> Working list of carryforwards surfacing during v2.5 (Phase 10) burndown.
> Authored at substage close-time as concerns are surfaced; consolidated into a final
> carryforwards-v2.6.md at Phase 10 close.

## Source: 10.1 code-quality review (bg `acefdc9d74464c76e`, 2026-04-28)

Report: `agent-workspace/memory/observations/task-10.1-20260428-code-quality.md`
Verdict: PASS_WITH_CONCERNS (0 blocking, 3 important, ≥3 nitpicks)

### CF-V2.6-10.1-FAIL-COUNT-DEAD
**Source**: `scripts/verify/post-phase.sh:111-112,402-403,501`
**Severity**: cosmetic/dead-code
**Description**: `FAIL_COUNT` and `GATE_FAIL_COUNT` are always equal — both increment together at lines 402-403; no code path diverges them. The comment at line 499 describes a scenario that cannot occur. `FAIL_COUNT` is redundant.
**Why deferred**: not a bug; no incorrect behavior. Cleanup-only.
**How to apply**: in v2.6 cleanup pass, collapse to a single accumulator (`GATE_FAIL_COUNT`) and remove `FAIL_COUNT`. Update comments.

### CF-V2.6-10.1-DUPLICATE-A4-PASS
**Source**: `scripts/verify/post-phase.sh:233 + 283`
**Severity**: cosmetic
**Description**: When `drift-check.sh` exists and passes, two `[PASS] A.4` lines appear in output. Pre-existing from 9.4 (not introduced by 10.1).
**Why deferred**: cosmetic only; no functional impact.
**How to apply**: dedup the second print path.

### CF-V2.6-10.1-LEXICOGRAPHIC-DEDUP
**Source**: `scripts/audit/substage-parallelism-flag.sh:105`
**Severity**: real bug, low current risk
**Description**: `[[ "$SUB_A" < "$SUB_B" ]]` is bash string comparison: "9.10" < "9.2" lexicographically (char "1" < "2"), causing double-counting for phases with 10+ substages.
**Why deferred**: current phases use at most 9 substages; bug does not trigger. Will trigger when any phase reaches substage X.10.
**How to apply**: replace with `version sort` (`printf '%s\n%s\n' "$A" "$B" | sort -V | head -1`) or split-on-dot integer comparison. Add a regression test fixture with substage IDs 9.10, 9.2 to validate. Phase 10 itself reaches 10.5.3 — actively at risk.

**URGENCY ASSESSMENT FOR PHASE 10**: Phase 10 has substages 10.1, 10.2, 10.3, 10.4, 10.5.1, 10.5.2, 10.5.3, 10.6, 10.7. The "10.10" trigger is not yet reached, but **10.1 vs 10.5** comparison: "10.1" < "10.5" (char '1' < '5') ✓ correct order. **10.5.1 vs 10.5.2**: "10.5.1" < "10.5.2" ✓. The bug only manifests for two-digit minors (X.10 vs X.2). Phase 10 does NOT trigger.

## Source: 10.2 code-quality review (bg `a26d911533bcfa246`, 2026-04-28)

Report: `agent-workspace/memory/observations/task-10.2-20260428-code-quality.md`
Verdict: PASS (0 blocking, 0 important, 2 nitpicks)

### CF-V2.6-10.2-R9-PRECONDITION
**Source**: `tests/scripts/citation-linter-rollup.spec.ts:146`
**Severity**: nitpick / test robustness
**Description**: R9 asserts `exitCode === 0` against the live phase-9 rollup but does not assert that WebFetch or TaskList actually appear in the tested file. If the rollup is regenerated without those rows, R9 silently loses CF-25 regression value.
**How to apply**: add `expect(readFileSync(phase9Path,'utf8')).toMatch(/WebFetch/)` precondition guard.

### CF-V2.6-10.2-BUILTIN-EVENTS-ORDERING
**Source**: `scripts/utilities/citation-linter.ts:17`
**Severity**: nitpick / readability
**Description**: `WebFetch`/`TaskList` land after `PostToolUse` in `BUILTIN_HOOK_EVENTS` with no grouping comment. Future maintainers may not see why.
**How to apply**: regroup with explicit `// tool names` vs `// lifecycle event names` sub-comments.

## Source: 10.5.2.C code-quality review (bg `a05668ea3deefa4cc`, 2026-04-28)

Report: `agent-workspace/memory/observations/task-10.5.2.C-20260428-code-quality.md`
Verdict: APPROVED (0 blocking, 0 concerns, 2 nitpicks)

### CF-V2.6-10.5-AGENT-TYPE-DECISION-RECORD
**Source**: `scripts/hooks/component-telemetry.sh:194`, `scripts/hooks/dispatch-jsonl-recorder.sh:74`
**Severity**: nitpick / documentation
**Description**: The choice of `agent_type` (not `subagent_type`) as the canonical sidecar field name is consistent across B + C and aligned with Decision 023, but no dedicated decision record exists for the SC-39 sidecar context. A future maintainer auditing the hooks in isolation may not find the rationale.
**How to apply**: optional decision record `decisions/03X-10.5-agent-type-field-naming.md` referencing Decision 023 + the architect spec's IMP-1 deferral.

### CF-V2.6-10.5-T-NA2-DEDUP-COMMENT
**Source**: `tests/hooks/component-telemetry.spec.ts:413-454`
**Severity**: nitpick / documentation
**Description**: T-NA2 mitigates the dedup race via per-event sequential polling, but the comment doesn't explain why the 5ms `Atomics.wait` is sufficient (it is — the 7x `node -e` startup cost in the background subshell is the actual guard).
**How to apply**: one-line comment linking the 5ms yield to the subshell startup cost.

## Source: 10.5.2.B+B-fix code-quality review (bg `afc1a533874cc0890`, 2026-04-28)

Report: `agent-workspace/memory/observations/task-10.5.2.B-20260428-code-quality.md`
Verdict: APPROVED_WITH_CONCERNS (0 blocking, 2 important, 2 nitpicks)

### CF-V2.6-10.5-POSTTOOL-REGEX-BRITTLENESS
**Source**: `scripts/hooks/dispatch-jsonl-recorder.sh:27-29`
**Severity**: important / silent-degradation risk
**Description**: PostToolUse regex `/agentId:\s*([a-f0-9]{10,20})/i` parses hex agent_id from Claude Code Agent tool result text. Depends on internal result-text format stability. If Anthropic changes the format (e.g., `"Agent ID: <hex>"` or structured JSON), regex silently returns `''` → PostToolUse writes nothing to sidecar → SubagentStop falls back to unknown-agent. B.B.4 graceful degradation preserves correctness, but pairing_rate drops without alert.
**Why deferred**: graceful degradation works; v2.5 prerequisite (≥0.40) is met. Adding monitoring is non-trivial.
**How to apply**: minimum — one-line comment near line 29 documenting the brittleness. Better — emit a structured warning to stderr when `RESULT_AGENT_ID` is empty for an `event=COMPLETED` of tool=Agent. Best — extract format-stability test into integration test that asserts current Claude Code version emits the expected text shape.

### CF-V2.6-10.5-AGENT-TYPE-NAMING-DIVERGENCE
**Source**: `scripts/hooks/dispatch-jsonl-recorder.sh:55,74` + architect spec line 56
**Severity**: important / documentation
**Description**: Architect spec `10.5-sc39-structural-unblock-architect.md:56` says sidecar stores `subagent_type`. Implementation stores `agent_type` (consistent across B + C; aligned with Decision 023). IMP-1 was architect-deferred but the divergence is undocumented in code. Future maintainer reads spec→code, gets confused.
**Why deferred**: not a defect; field name is canonical per Decision 023.
**How to apply**: add a comment at the PreToolUse sidecar write point referencing Decision 023 + IMP-1 deferral, OR amend Decision 023's rationale section to acknowledge the divergence.

### CF-V2.6-10.5-TUI-JSON-NAMING
**Source**: `scripts/hooks/dispatch-jsonl-recorder.sh:102-106`
**Severity**: nitpick / readability
**Description**: `TUI_JSON` variable name is an opaque abbreviation for "Tool Use ID JSON-safe value." Comment at line 97 explains the purpose but the variable name doesn't hint at why two forms exist.
**How to apply**: rename to `TOOL_USE_ID_JSON` for self-documentation.

### CF-V2.6-10.5-H8-FIXTURE-NAME
**Source**: `tests/hooks/dispatch-recorder.spec.ts:403`
**Severity**: nitpick / cosmetic
**Description**: H8 uses `subagent_type: 'test-impl'` which is not a canonical subagent type (model-map falls through to `unknown`). Self-documenting fixtures should use real types.
**How to apply**: change to `'task-implementer'` (or another canonical value); H8 doesn't assert on `model` so behavior unchanged.

## Source: 10.5 sandwich-verifier (bg `a038e6b7d4204180b`, 2026-04-28)

Report: `agent-workspace/memory/observations/task-10.5-20260428-sandwich-verifier.md`
Verdict: PASS_WITH_CONCERNS (0 critical, 1 important, 9 minor → all already routed above)

### CF-V2.6-AUDIT-TRAIL-INLINE-RETURN-PATTERN
**Source**: pattern observed across multiple reviewers — 10.5.2.B-spec, 10.5.2.B-fix-spec, 10.5.2.B-CQ, 10.5-verifier.
**Severity**: important / paper-trail integrity
**Description**: Multiple reviewer subagents returned their findings inline only, never writing to the canonical `observations/<task>-<date>-<role>.md` path despite explicit briefs requesting file writes. Confirmed missing standalone files: `task-10.5.2.B-20260428-spec-compliance.md`, `task-10.5.2.B-fix-20260428-spec-compliance.md`. Findings are reconstructable from inline transcripts + downstream citations, but the canonical audit-trail is incomplete.
**Why deferred**: not a blocker for v2.5 close — the engineering outcomes are correct and the verifier accepted reconstructed evidence. v2.6 should standardize the reviewer subagent contract.
**How to apply (3 paths, choose one or combine)**:
1. Subagent contract: bake `Write` tool invocation into the spec-compliance-reviewer + code-quality-reviewer + sandwich-verifier templates so the file write is non-skippable.
2. Hook-side: PostToolUse hook for the reviewer subagent that detects a missing observation file and writes the inline content automatically.
3. Orchestrator-side: when a reviewer returns inline-only, the dispatcher (this main session) writes the report itself before moving on. Already practiced ad-hoc; could be promoted to a discipline skill.

The orchestrator already practices path #3 reactively (this session created `task-10.5.2.B-20260428-code-quality.md` and `task-10.5-20260428-sandwich-verifier.md` from inline returns). v2.6 should formalize one of the three paths above.
