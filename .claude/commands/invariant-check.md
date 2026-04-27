---
name: invariant-check
description: Use to run all grep-based invariant checks from constitution/invariants.md before claiming any IMPL task done. Auto-runs during session-end.
tools: [Read, Bash, Grep]
---

# /invariant-check — Run All Invariant Greps

> Runs grep-based invariant checks from constitution/invariants.md.
> Should run before claiming any IMPL task done. Auto-runs during /session-end.

## Steps

### 1. I-1: No Anthropic SDK in core
```bash
grep -rn "@anthropic-ai/sdk\|@anthropic-ai/claude-agent-sdk\|anthropic.messages\|Anthropic(" \
  packages/core/src/ 2>/dev/null | grep -v "\.spec\.ts\|\.test\.ts"
```
Expected: empty.

### 2. I-2: No project-name hardcoding
```bash
grep -rn "stockforge\|StockForge\|vnstock\|VCB" packages/core/src/ 2>/dev/null
```
Expected: empty.

### 3. I-3: No Agent SDK for chat
```bash
grep -rn "ClaudeSDKClient\|@anthropic-ai/claude-agent-sdk\|query(.*prompt" \
  packages/core/src/ 2>/dev/null | grep -v "\.spec\.ts\|\.test\.ts"
```
Expected: empty.

### 4. I-4: Managed projects don't depend on orch
For each managed project (e.g., examples/stockforge-integration):
```bash
grep -l "@orch/" <project>/package.json
```
Expected: no match.

### 5. I-5: No direct auth folder access
```bash
grep -rn "readFileSync.*\.ccs\|readFile.*\.ccs\|fs\.readFileSync.*\.claude\b" \
  packages/ 2>/dev/null
```
Expected: empty.

### 6. I-14: No module-level mutable state
```bash
grep -rn "^let\s\|^var\s" packages/core/src/ 2>/dev/null | grep -v "\.spec\.ts"
```
Expected: empty (only const).

### 7. I-10: Typed external input (manual check reminder)
For each new HTTP endpoint, Telegram handler, YAML reader:
- zod schema defined?
- `.parse()` called at boundary?

### 8. Layering Check
```bash
# Domain should not import from modules
grep -rn "from ['\"]\\.\\./modules\|from ['\"]@orch/core/modules" \
  packages/core/src/domain/ 2>/dev/null
```
Expected: empty.

```bash
# Modules should not import other modules' internals (only via public service)
# Manual visual check
```

### 9. Hardcoded Paths
```bash
grep -rn "/home/\|/Users/\|/root/" packages/ 2>/dev/null \
  | grep -v "\.spec\.ts\|test\|__fixtures__"
```
Expected: empty.

### 10. Report

```markdown
## Invariant Check — <DATE> <TIME>

| Invariant | Status | Violations |
|---|---|---|
| I-1 (no SDK) | PASS/FAIL | N files |
| I-2 (no hardcoded names) | PASS/FAIL | ... |
| I-3 (no Agent SDK) | PASS/FAIL | ... |
| I-4 (one-way dep) | PASS/FAIL | ... |
| I-5 (creds isolation) | PASS/FAIL | ... |
| I-14 (no module state) | PASS/FAIL | ... |
| Layering | PASS/FAIL | ... |
| Paths | PASS/FAIL | ... |

<If any FAIL, list file:line for each violation>

Overall: ALL PASS | VIOLATIONS PRESENT
```

## Blocking Behavior

- In autonomous mode: if any I-1, I-2, I-3 fails → STOP-4 (destructive/charter) — this is a serious drift
- If I-14 or layering fails → fix before task done
- If minor (I-10 zod missing at a new endpoint) → fix in same session

## Scheduling

- Run at end of every IMPL session (integrated into /session-end)
- Run in CI (GitHub Actions)
- Run before any release

## Spawned Session Handling

Run all checks. If I-1, I-2, or I-3 fails → write `agent-workspace/memory/escalation.md` with STOP-4 and halt.
