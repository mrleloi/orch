# Session Budgets

> Context budget rules. Quality cliff at 250K is real — measured across 51+ sessions in the parent StockForge project.

---

## The Quality Cliff

```
Token usage         Tasks/100K tokens     Quality observation
─────────────────────────────────────────────────────────────
50-80K              ~1.0                  Focused output
80-150K             ~1.2                  Guided execution
150-250K            ~1.0                  OK if chunked
250K+               <0.5                  Quality degrades sharply
300K+ mixed role    0.0                   FAILED (historical)
```

**Rule**: If projected session > 250K tokens → MANDATORY SPLIT.

---

## Session Types (Orch project)

### PLAN
- **Budget**: 50-80K
- **Purpose**: Produce session plan for a phase or feature
- **Output**: File in `agent-workspace/session-plans/pending/`
- **Never**: writes production code

### FOCUSED_IMPL
- **Budget**: 100-150K
- **Purpose**: Implement 1-3 tasks from existing plan
- **Output**: Code + tests in packages
- **Requires**: pre-existing plan

### MULTI_TASK_IMPL
- **Budget**: 150-250K
- **Purpose**: Implement 4-10 tasks from existing plan
- **Constraints**: hard 250K cap. Split if plan has >10 tasks.

### VERIFY
- **Budget**: 30-60K
- **Purpose**: Adversarial review of previous implementation
- **Agent**: separate subagent (fresh context)
- **Critical**: must be separate agent, same-agent review = echo chamber

### RESEARCH
- **Budget**: 60-120K
- **Purpose**: Study reference repos, produce `research/<repo>.md`
- **Output**: markdown notes, no code

### RECOVERY
- **Budget**: 80-150K
- **Purpose**: Revert failed approach, re-plan
- **Pattern**: revert first, diagnose, plan alternative

---

## Decision Tree

```
START
│
├─ Q1: Detailed plan already exists?
│   ├─ NO  → Type: PLAN
│   └─ YES → Q2
│
├─ Q2: How many tasks in plan?
│   ├─ 1-3 small → FOCUSED_IMPL
│   ├─ 4-10 → MULTI_TASK_IMPL
│   └─ >10 → SPLIT plan
│
├─ Q3: Reference repos unread?
│   └─ YES → Type: RESEARCH (insert before impl)
│
├─ Q4: Previous session failed?
│   └─ YES → Type: RECOVERY (prepend)
│
└─ Q5: Previous impl needs check?
    └─ YES → Schedule VERIFY after
```

---

## Budget Estimation Formula

```
Fixed overhead (every session):
├─ CLAUDE.md ..................... ~2.5K
├─ Constitution (relevant parts) . ~3-5K
├─ project.md .................... ~1.5K
├─ current-execution.md .......... ~0.5K
├─ Last 3 session logs ........... ~3K
├─ Loaded skill definitions ...... ~1.5K
──────────────────────────────────────
Total fixed ..................... ~12K

Variable (per task):
├─ Per module loaded ............. ~3K (module src + tests)
├─ Per spec loaded ............... ~4K
├─ Per reference repo read ....... ~8K (scan) or ~20K (deep)
├─ Per code file to write ........ ~2K
├─ Tool use overhead ............. ~5-10K
├─ Output working space .......... 30% of total

If estimated > 250K → SPLIT required.
```

### Example Estimations

**Task: "Implement QueueModule"**
```
Fixed:                                   12K
+ Queue feature module files:            10K
+ Prisma schema:                          3K
+ SPEC-003 queue spec:                    5K
+ 2 reference patterns (claudegram q):   15K
+ Files to write (~6 files):             12K
+ Output working space:                  15K
─────────────────────────────────────────────
Estimated:                               72K  ✓ well under 150K
```

**Task: "Phase 0 full research"**
```
Fixed:                                   12K
+ 5 reference repos scan (~10K each):    50K
+ 2 deep reads (~20K each):              40K
+ Research notes output:                 20K
─────────────────────────────────────────────
Estimated:                              122K  ✓ under 250K, but tight
→ Consider splitting: RESEARCH-A (repos 1-3) + RESEARCH-B (repos 4-5)
```

---

## Budget Tracking During Session

### Thresholds
- **<50%**: proceed normally
- **50-70%**: caution, avoid loading large new files
- **70-85%**: finalize current task, prepare handoff
- **>85%**: immediate handoff, session end
- **>92% (230K+)**: emergency — stop mid-task if necessary

### In Autonomous Mode
- At 150K: start summarizing current work into handoff note
- At 200K: finish current file/task cleanly
- At 230K: end session, write detailed pickup note for next session

---

## Hard Rules

### R-1: Never mix PLAN + IMPL in same session
Different mental modes, different file loads, quality cliff earlier.

### R-2: If plan has >10 tasks, SPLIT
Quality drops after task 8-10 even if context allows.

### R-3: Recovery revert first
Don't "fix" a broken state by adding more code. Revert, diagnose, plan alternative.

### R-4: Verify budget before loading
Estimate before reading large files. If over budget, either reduce scope, split session, or escalate.

### R-5: RESEARCH sessions don't write code
They produce markdown. Implementation happens in separate IMPL sessions.

### R-6: No commit during budget crisis
If approaching 85%, do NOT commit. Stage, write handoff, stop. Next session will commit with full context.

---

## Handoff Template (when splitting)

In `agent-workspace/memory/sessions/YYYY-MM-DD-session-N.md`:

```markdown
## Next Session Pickup

**Current task**: [Task ID and name]
**Progress**: [X of Y subtasks done]
**Files modified (staged, not committed)**:
- path/to/file.ts: [what changed]

**What's next**:
1. [Specific next action]
2. [Second action]

**Gotchas discovered**:
- [Any surprise learned this session]

**Context to reload**:
- [Specific files next session should read first]
- [Do NOT reload: stuff that turned out irrelevant]

**Decisions made this session**: [references to decisions/NNN.md]
```

---

## Budget Escalation Template

If budget is genuinely insufficient and splitting doesn't help:

```markdown
# BUDGET ESCALATION

Session type: MULTI_TASK_IMPL
Planned tasks: 8
Estimated budget: 340K tokens (exceeds 250K)

Options considered:
1. Split into 2 sessions of 4 tasks each → RECOMMENDED
2. Reduce scope — defer tasks 7-8 → secondary
3. Different architectural approach → requires re-spec

Recommendation: Option 1 (split at task 4/5 boundary).

Proceeding with Option 1. Next session picks up at task 5.
```

Not a STOP. Just split and continue. Document in session log.
