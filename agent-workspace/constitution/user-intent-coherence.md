# User-Intent Coherence

> **Status**: BINDING constitution document.
> **Authored**: 2026-04-28 (Session #47, post-Phase-11 close, pre-Phase-12 entry).
> **Authority**: Decision 040 §5 mandate.
> **Purpose**: Prevent the 4-cycle CF-DOGFOOD-2 defer pattern from recurring on any USER-CRITICAL item.

---

## §A Why this document exists

User intent expressed via `tasks/*/user_prompt.txt` files MUST drive phase prioritization. Charter-coherence defer logic (Decision 033 "Deliberation E" pattern; multi-cycle structural-defer) is admissible ONLY when the user has not explicitly prioritized the item.

Phase 8 → 9 → 10 → 11 deferred CF-DOGFOOD-2 four cycles in a row, despite `user_prompt.txt` mục 1.5 ("phase 8 trở đi nên thực sự được tiếp cận bằng cách dùng chính dự án này") being USER-CRITICAL from the moment Phase 8 was entered. The defer rationale each cycle was technical (SC-39 prereq, OSS not launched, no drift, etc.) — none addressed the user-intent priority directly.

**Root cause**: master-planner reads charter, decisions, carryforwards-vN.md — but **never re-reads `tasks/*/user_prompt.txt`** at phase entry. User intent gets frozen at Phase-8 architect output (encoded as a CF) and downgraded by CF-handling rules.

**Structural fix**: this constitution doc + `scripts/audit/user-intent-coherence-check.sh` post-phase gate.

---

## §B User-prompt inventory + priority tags

### B.1 `tasks/feat_04_continue_before_phase_8/user_prompt.txt` (Phase 8 entry, 2026-04-27)

| Item | Wording | Priority Tag | Reason | Phase Address |
|---|---|---|---|---|
| 1.1 | "kiểm tra lại hệ thống agent config/settings" | USER-IMPORTANT | drift audit needed | Phase 8.3 (charter-drift audit; Decision 028) — ADDRESSED |
| 1.2 | "verify cũng không diễn ra thực sự đúng" | USER-IMPORTANT | verify automation | Phase 8.4 (post-phase.sh) — ADDRESSED |
| 1.3 | "không chắc trạng thái hiện tại của dự án có bị drift xa bao nhiêu" | USER-IMPORTANT | drift audit | Phase 8.3 — ADDRESSED |
| 1.4 | "build hệ thống hooks, script, orchestrator một cách mạnh mẽ hơn nữa" | USER-IMPORTANT | hooks ecosystem | Phase 8.4 + 8.5 + 11.2 — ADDRESSED (hook coverage 117/117 + audit-trail-discipline skill) |
| **1.5** | **"phase 8 trở đi nên thực sự được tiếp cận bằng cách dùng chính dự án này"** + **"quan trọng"** tag | **USER-CRITICAL** | dogfood / self-application; user explicitly tagged "quan trọng" | Phase 8.5.1 spec only (`self-application-bootstrap.md`); CF-DOGFOOD-2 deferred 4 cycles → **MUST be Phase 12 priority 1 per Decision 040** |
| **1.6** | **"khả năng tự nâng cấp độc lập ở mỗi dự án, và mỗi người sử dụng"** | **USER-CRITICAL** | multi-user/multi-project | Phase 8.6 (tenancy-model.md) + 8.7.2 (layered-resolver.ts) PARTIAL; per-user telemetry separation + sync stub MISSING → **Phase 12 substage required** |
| **1.7** | **"khả năng sharing được cho community, để thu thập dữ liệu"** + **"bắt buộc hoàn thành trước khi kết thúc dự án này"** | **USER-CRITICAL** | community sharing + data collection; user explicitly bound to project completion | Phase 8.7.4 OSS readiness PARTIAL; telemetry sync schema + privacy/consent flow + "domain workflow autonomous knowledge" framing MISSING → **Phase 12 substage required** |
| 1.8 | "/effort routing" + "/remote-control" | USER-IMPORTANT | tooling | Decision 032 (effort routing) + scripts/session-handoff.sh (--rc enforcement) — ADDRESSED |

**Summary**: 3 USER-CRITICAL items (1.5, 1.6, 1.7); 5 USER-IMPORTANT items. Of the 3 USER-CRITICAL: 1.5 deferred 4 cycles (load-bearing fix in Phase 12), 1.6 partial (gap = per-user namespace + sync), 1.7 partial (gap = sync schema + privacy + framing).

---

## §C Severity Tier

```
USER-CRITICAL       (> existing "important")
   │
   ├── Source: user_prompt.txt with explicit "quan trọng" / "important" / "bắt buộc" tag, OR
   │           user wording asserts hard dependency ("trước khi kết thúc", "must", "required")
   │
   ├── Defer rules: CANNOT defer to next phase without explicit user-override decision in
   │                current cycle. Multi-cycle defer is FORBIDDEN absent user re-grant per
   │                cycle.
   │
   └── Acceptance: closure attestation must explicitly cite user_prompt.txt clause.

important           (existing)
nitpick             (existing)
```

USER-CRITICAL is a strict superset constraint over `important`: an item can be USER-CRITICAL even if its technical complexity is low, because the priority comes from user intent, not engineering scope.

---

## §D Phase-entry checklist (master-planner mandate)

Every phase master-planner MUST execute the following BEFORE drafting the phase plan:

1. **Read all `tasks/*/user_prompt.txt` files** — not just the most recent one. Carry forward all USER-CRITICAL items from prior user_prompts that are not yet CLOSED.
2. **Build user-intent attestation table**: each USER-CRITICAL item → which substage of THIS phase addresses it.
3. **If deferring a USER-CRITICAL item**: author a binding decision in same phase that explicitly invokes user-override. Cite user_prompt clause + reason for defer + concrete v(N+1) re-attempt gate. NO multi-cycle defer absent user re-grant.
4. **Bake attestation into routing brief**: `phase-N-routing-brief.md` § "User-Intent Coherence" must enumerate USER-CRITICAL items with substage mapping.

---

## §E Anti-patterns (catalogued)

### E.1 The 4-cycle CF-DOGFOOD-2 defer (Phase 8 → 11)

**Pattern**: User_prompt.txt mục 1.5 USER-CRITICAL → encoded as CF at Phase 8 → defer-by-technical-rationale × 4 cycles → user explicitly called out at Phase 12 entry → Decision 040 R-039.5 user override invoked.

**Anti-pattern moves to avoid**:
1. Encoding USER-CRITICAL items as ordinary CFs (which then follow CF-handling rules instead of user-intent rules).
2. Letting prior phase defer rationale chain forward without re-checking user intent.
3. Adding R-039.5-style override clauses but never proactively invoking them at phase entry.
4. Master-planner reading carryforwards-vN.md but not user_prompt.txt at phase entry.

**Correct moves**:
1. Tag USER-CRITICAL items with their user_prompt.txt clause citation in `carryforwards-vN.md` (e.g., `[USER-CRITICAL: user_prompt.txt §1.5]`).
2. Master-planner phase-entry checklist (§D above) re-checks user intent.
3. Defer of USER-CRITICAL requires same-phase user-override decision; no chain-forward.

### E.2 Conflating independent concerns into a single defer dependency

CF-DOGFOOD-2 defer rationale claimed gate on R-039.1 (= SC-39 ENABLE_RETRY). Decision 040 §3 documents that these concerns are independent (telemetry quality vs runtime dispatch). Decoupling unblocks USER-CRITICAL items.

**Move**: when authoring a defer, write an "independence audit" section: list the named blocker, prove the dependency is real, not architectural conflation.

### E.3 Asking user permission mid-autonomous-execution

Receiving a user_prompt.txt = full mandate. "Should I do A, B, or C?" mid-execution = anti-pattern (= silent loop-break dressed as due diligence). Pick best, document, proceed.

---

## §F Audit hook: `scripts/audit/user-intent-coherence-check.sh`

Wired into `scripts/verify/post-phase.sh` as a CLASS-A check (A.9 user-intent coherence).

**Logic**:
1. Read all `tasks/*/user_prompt.txt` files.
2. Extract USER-CRITICAL items (heuristic: lines tagged with "quan trọng" / "important" / "bắt buộc" / "critical").
3. For each USER-CRITICAL item, locate either:
   - (a) Closure attestation in `phase-N-complete.md` cite-ing the user_prompt clause, OR
   - (b) User-override decision in `decisions/NNN-*.md` for current cycle, OR
   - (c) Substage in current phase's routing brief addressing the item.
4. FAIL the check if any USER-CRITICAL item is in none of (a)/(b)/(c).
5. WARN if any USER-CRITICAL item has been carried > 2 cycles without (a) closure.

---

## §G Maintenance

- Update §B inventory whenever a new `tasks/*/user_prompt.txt` arrives.
- Append to §E anti-pattern catalogue when new procedural drift surfaced.
- This document is BINDING; changes require explicit reasoning.
