> From: https://claude.ai/chat/66d0aa01-977f-4c30-a62d-66457b429ee0

# you asked

đây là cấu hình để code với ai agent, chủ yếu là claude/claude code của tôi, là starter kit cho dự án mới, hướng tới full automation agent code, loại bớt human-in-the-loop nhất có thể, human chỉ tham gia ở bước research, phân tích, ra quyết định về scope/objective, giúp định hình, shape dự án, còn full implementation/run job sẽ do agent/sub-agent, harness xoay quanh claude/claude code. tôi đang muốn cải thiện bộ starter kit này, về mặt workflow với agent, không cần quan tâm về business side. ví dụ các trending agent repo, như https://github.com/affaan-m/everything-claude-code/tree/main, chúng có gì hay để chúng ta học hỏi và mang về dự án, phân tích thật kĩ

---

# you asked

Continue

---

# claude response

Now let me fetch the reference repo they mentioned to see what it offers.

Let me dig into the most innovative specific skills/patterns in ECC.

<br>

# Phân tích starter kit StockForge & đề xuất cải tiến từ ECC

Sau khi khảo sát kỹ bộ kit của bạn và đào sâu vào `affaan-m/everything-claude-code` (ECC) cùng các harness pattern đang trend, đây là phân tích.

## 1. Đánh giá thẳng: starter kit hiện tại của bạn đang ở đâu

**Điểm rất mạnh — bạn đang dẫn trước ECC ở vài chỗ quan trọng:**

| Khía cạnh | StockForge | ECC |
|---|---|---|
| Constitution as first-class (immutable rules, invariants, boundaries) | ✅ 9 files, 2.4K dòng, versioned | ❌ Chỉ có `rules/` phẳng, không có khái niệm "immutable constitution" |
| Memory MIL pattern (3-tier: session / project / permanent) | ✅ Rõ ràng | ❌ Chỉ có hooks save context, không có tiered memory contract |
| Ubiquitous Language như first-class citizen (DDD-native) | ✅ glossary + domain-mapping + drift-log + `/ul-audit` + DR7 | ❌ Không có |
| Session types với budget cap (250K) + forced split rules | ✅ 8 loại, decision tree | ⚠️ Chỉ có `strategic-compact` skill, không có session-type taxonomy |
| Sandwich Pattern (Architect→Dev→Verifier isolated contexts) | ✅ Enforced | ⚠️ Có planner/tdd-guide/reviewer nhưng không explicit isolation contract |
| Dual-layer spec (Part A business + Part B agent contract) | ✅ | ❌ Không có concept này |
| Drift signals numbered + severity + scripts | ✅ DR1-DR12 | ⚠️ Có `/harness-audit` nhưng kém granular |
| Domain-specific invariants (I-S1 no-LLM-math, etc.) | ✅ | ❌ Generic |
| VBW Protocol (Verify-Before-Write) với measured baseline | ✅ 11.1% → 0% | ❌ Không formalize |

**Nói thẳng:** về mặt *methodology* (how-to-think-about-building-with-agents), bạn đang ở tier cao hơn ECC. ECC là một *distribution* (install nhiều thứ có sẵn), còn bạn là một *workflow framework* có triết lý rõ ràng.

**Điểm ECC đang hơn bạn:**

1. **Continuous Learning v2 (Instincts system)** — deterministic observation via hooks, auto-extract patterns, confidence scoring, evolution pipeline. Bạn có `agent-notes.md` nhưng update thủ công.
2. **Hook ecosystem** — ECC có runtime control (`ECC_HOOK_PROFILE=minimal|standard|strict`, `ECC_DISABLED_HOOKS=...`), pluggable. Bạn chỉ có 1 `pre-commit.example`.
3. **Model routing như là first-class concern** — `/model-route`, `CLAUDE_CODE_SUBAGENT_MODEL=haiku`, explicit cost-tier selection. Bạn có model field trong subagent frontmatter nhưng không có routing rule.
4. **Token optimization as engineering concern** — `MAX_THINKING_TOKENS`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, strategic compact. Bạn chỉ có session budget.
5. **Iterative retrieval pattern cho subagent** — 4-phase Dispatch→Evaluate→Refine→Loop. Giải quyết vấn đề subagent "blind start".
6. **Continuous agent loop / autonomous loop skill** — explicit patterns cho long-running autonomous execution với quality gates & recovery.
7. **Plugin manifest, marketplace installability** — package & distribute được.
8. **`/harness-audit`** — reflexive: bản thân harness tự audit quality.
9. **Search-first skill** — research-before-coding formalized.
10. **Cross-harness parity** (Cursor/Codex/OpenCode) — AGENTS.md làm universal root.

Anthropic cũng công khai 3 bài engineering mà mọi người nên đọc: *Effective Harnesses for Long-Running Agents*, *Building a C Compiler with Parallel Claudes*, *Demystifying Evals for AI Agents*. ECC convergence với các nguyên lý này. Bạn nên convergence thêm một bước nữa.

---

## 2. Phân tích sâu những ý tưởng ECC đáng mang về

### 2.1 Instincts system (continuous-learning-v2) — **đây là viên ngọc lớn nhất**

**Ý tưởng lõi:** Thay vì để agent-notes.md là file markdown cập nhật thủ công sau post-mortem, hệ thống *quan sát tự động* session qua `PreToolUse`/`PostToolUse` hooks (100% fire rate — khác với skills chỉ fire 50-80% theo judgment của Claude), phát hiện pattern (user correction, error resolution, repeated workflow) và sinh ra *atomic instincts* với confidence score.

**Tại sao nó quan trọng với bạn:** Starter kit hiện tại phụ thuộc nhiều vào self-discipline của human để viết agent-notes sau mỗi session. Thực tế full-automation sẽ không làm bước này. Instincts giải quyết đúng vấn đề: **cách để harness tự học mà không cần human-in-the-loop**.

**Cấu trúc đáng mượn:**
```
agent-workspace/
├── instincts/
│   ├── observations.jsonl     # append-only, tool events
│   ├── personal/              # auto-learned, confidence-scored YAML
│   ├── inherited/             # imported
│   └── project/<hash>/...     # project-scoped (v2.1)
```

Mỗi instinct có:
```yaml
---
id: always-verify-as-of-date-before-backtest
trigger: "when writing backtest query"
confidence: 0.7
domain: "financial-data-protocol"
source: "session-observation"
evidence:
  - "Session 12: user corrected get_latest() to get_as_of()"
  - "Session 17: same correction"
  - "I-S2 invariant"
---
```

Confidence: 0.3 tentative → 0.5 moderate → 0.7 strong → 0.9 core. Tăng khi repeat, giảm khi contradicted.

**Adapt cho StockForge thế nào (quan trọng):** Bạn cần giữ **constitutional invariants là immutable** (human-curated), còn instincts là **learned heuristics dưới constitution**. Instincts KHÔNG được phép override `invariants.md`. Cần 1 rule explicit: "instincts phải được verified against constitution; conflicting instincts auto-decayed." Điều này khác ECC — ECC không có constitution layer.

Thêm nữa, với stock domain của bạn, mỗi instinct cần có `conflicts_with_invariant: null | I-S<N>` field để DR-check từ chối những instinct vi phạm hard rule.

**Evolution pipeline** (ECC's `/evolve` command): khi ≥3 instincts cùng domain reach confidence 0.7, cluster thành 1 skill draft cho human review. Phù hợp với pattern "auto-promote to skill" bạn đã có trong `write-a-skill/` nhưng chưa có trigger tự động.

### 2.2 Iterative Retrieval Pattern — fix subagent "blind start"

ECC formalized pattern 4-phase (inspired by Iter-RetGen 2023 EMNLP paper):

```
Dispatch (broad query) 
  → Evaluate (relevance scoring, gap identification)
  → Refine (specific file paths, terminology)
  → Loop (until complete or max iterations)
```

**Vấn đề nó giải quyết với bạn:** Sandwich-dev hoặc verifier subagent của bạn khi nhận plan, bắt đầu với zero context. Nó dispatch ra, grep, đọc file — nhưng thường trả lại "incomplete summary" vì không biết terminology của codebase. Thay vì spawn subagent mới (expensive), resume cùng subagent với gap-specific follow-up.

**Mang về ra sao:** Thêm 1 skill `.claude/skills/iterative-context-retrieval/` với decision tree:

```
Khi sandwich-dev được dispatch:
  Phase 1 (Dispatch): broad search theo task keywords
  Phase 2 (Evaluate): score mỗi file đã đọc theo relevance 0-1, 
                     liệt kê terminology gaps (terms seen nhưng không hiểu)
  Phase 3 (Refine): 
    - nếu relevance tổng <0.7 → refine query với specific paths
    - nếu có terminology gap → grep term, đọc definition
  Phase 4 (Loop): tối đa 3 iterations, sau đó escalate
```

Pair với UL glossary của bạn: terminology gap phase tự động cross-reference glossary — pattern cực fit với DDD workflow.

### 2.3 Search-first / Research-first skill

ECC's `search-first` skill: research BEFORE coding, forced ritual. Match với philosophy của bạn là "human làm research, agent làm implementation." Nhưng ngay cả agent cũng cần research — trước khi implement một vendor SDK integration, một VN stock data provider API, v.v.

**Adapt:** Tạo skill `.claude/skills/research-first/SKILL.md` với trigger "khi implementation động vào external API, thư viện chưa dùng, hoặc VN market data source mới." Behavior: BLOCK Edit/Write/Bash cho đến khi đã:
1. Grep codebase tìm prior art
2. Web search docs chính thức
3. Verify version compatibility
4. Document decision vào `agent-workspace/memory/research/<topic>.md`

ECC có "fact-forcing gate" skill tương tự — đo được +2.25 điểm chất lượng vs ungated agents.

### 2.4 Hook runtime controls

ECC có `ECC_HOOK_PROFILE=minimal|standard|strict` và `ECC_DISABLED_HOOKS=pre:bash:tmux,post:edit:typecheck`. Bạn chỉ có 1 pre-commit.example — đang quá cứng.

**Đề xuất concrete:**

```
.claude/hooks/
├── profiles/
│   ├── minimal.json       # chỉ block destructive ops
│   ├── standard.json      # + mypy + ruff + unit test
│   └── strict.json        # + drift-check HIGH + UL audit + eval-regression
├── events/
│   ├── pre-bash.sh
│   ├── post-edit-python.sh
│   ├── post-edit-spec.sh
│   ├── session-start.sh
│   ├── session-end.sh
│   └── pre-compact.sh
└── README.md             # mapping event → script
```

Quan trọng: env var `STOCKFORGE_HOOK_PROFILE=standard` default, nhưng THESIS session cần `strict` (vì touch financial output). Session type → hook profile mapping nên explicit trong session-budgets.md.

### 2.5 Session memory persistence hooks — tự động hoá session-start/end

Hiện `/session-start` và `/session-end` phải human-trigger. Điều này vi phạm goal "loại human-in-the-loop tối đa."

**ECC pattern:** `SessionStart` hook tự động load `memory/current-execution.md` + last 3 sessions. `Stop` hook (session end) tự động persist session summary.

**Mang về:** Port `session-start.md` và `session-end.md` command logic thành shell scripts trong `.claude/hooks/events/session-start.sh` và `session-end.sh`. Chúng chạy tự động. Command `/session-start` chỉ còn để user override khi muốn re-load sau giữa session.

SQLite state store như ECC v1.9 thêm (thay cho flat markdown) cũng đáng cân nhắc — cho query nhanh hơn lịch sử session + thesis. Nhưng giữ markdown là source of truth (git-diffable), SQLite chỉ là index.

### 2.6 Model routing / token optimization làm first-class

ECC thêm `/model-route` command + `CLAUDE_CODE_SUBAGENT_MODEL=haiku` env var. Ý tưởng: mỗi subagent role nên có cost-tier declaration rõ ràng.

Bạn đã có `model: opus|sonnet` trong frontmatter subagents. Nhưng chưa có routing skill hoặc budget check theo cost, chỉ có token.

**Đề xuất:** Thêm `.claude/skills/model-routing/SKILL.md`:

```
| Session Type      | Orchestrator | Subagent default | Exception |
|-------------------|--------------|------------------|-----------|
| PLAN              | opus         | sonnet           | master-planner=opus |
| FOCUSED_IMPL      | sonnet       | sonnet           | — |
| MULTI_TASK_IMPL   | sonnet       | haiku (grep/read)| sandwich-dev=sonnet |
| VERIFY            | opus         | sonnet           | — |
| THESIS            | opus         | sonnet           | devils-advocate=opus |
| INGEST            | haiku        | haiku            | evidence-extraction=sonnet |
| POST-MORTEM       | sonnet       | haiku            | — |
```

Kết hợp với `/budget-check`: budget tính theo *$* không chỉ *tokens*.

### 2.7 Continuous agent loop skill — autonomous execution pattern

ECC có `continuous-agent-loop` skill với sub-patterns: sequential pipeline, PR loop, DAG orchestration, parallel exploration. Match rất mạnh với goal full-automation của bạn.

**Áp dụng cho StockForge:** thesis validation loop, daily KOL ingest, weekly post-mortem — tất cả đều là autonomous loops.

Skill này đi kèm quality gate & recovery. Cần `agent-workspace/loops/<loop-name>/` chứa checkpoint state, progress file, error log — đúng cái Anthropic blog "Effective Harnesses for Long-Running Agents" và "Building C Compiler with Parallel Claudes" recommend.

Bạn đã có khung session plan; thêm `loop-plan` thành extension.

### 2.8 `/harness-audit` — reflexive self-assessment

ECC ship command này: audit harness config tự động, scorecard. Bạn có `/drift-check` nhưng nó về codebase drift, không phải harness drift.

**Đề xuất** `/harness-audit` cho bạn check:
- Có agent nào không được invoke ≥N sessions qua? (orphan)
- Skill nào không match pattern trong ≥N session? (stale)
- Constitution files bị modify mà không có version bump? (violation)
- Hook profile có match session type đang chạy?
- Instinct conflict với invariant?
- Cost per session trend?

Output scorecard A-F, append `agent-workspace/quality-reports/harness-audits/`.

### 2.9 AGENTS.md root làm universal entry — cross-harness

Nếu muốn tương lai dùng Codex/Cursor/Cowork song song với Claude Code (ví dụ subagent parallel work), cần 1 file root mà tất cả đều đọc được: `AGENTS.md`.

Bạn đang có `CLAUDE.md` + `AGENT_OPERATING_MANUAL.md` tách biệt. AGENT_OPERATING_MANUAL đang dùng 1365 dòng — quá nặng cho load-always. Split:

- `CLAUDE.md` (bạn có, <2500 tokens) — Claude-specific
- `AGENTS.md` mới, <2000 tokens — universal cross-harness, pointer đến các file khác
- `AGENT_OPERATING_MANUAL.md` giữ nguyên nhưng *không load always*, chỉ đọc khi cần

### 2.10 Plugin-ification

ECC ship như plugin: `.claude-plugin/plugin.json` + `marketplace.json`. Cho phép user đơn giản hóa install. 

Với bạn, starter kit hiện tại là template. Cân nhắc:
- Tách *workflow framework core* (constitution template, sandwich pattern, VBW, session types, drift signals, skills chung) thành 1 plugin repo riêng — tái sử dụng dự án khác.
- StockForge-specific (financial-data-protocol, 9 BCs, I-S* invariants, thesis log) giữ trong project này.

Có value rất lớn nếu framework core được reuse nhiều project. Nhưng lưu ý đừng over-abstract quá sớm (P2 — Simplicity First).

---

## 3. Những thứ ECC có mà bạn KHÔNG nên mang về

Để tránh bloat:

- **`/plan`, `/tdd`, `/code-review`, `/build-fix` generic commands** — bạn đã có `/spec-author`, `/master-plan`, `/drift-check` với semantics chặt hơn. Đừng duplicate.
- **21+ language-specific reviewer agents** — bạn chỉ cần Python. Thêm gì cũng chỉ là noise.
- **119 skills catalog** — bloat khổng lồ. Bạn đã có 12 skills cơ bản, chất lượng cao. Chỉ add khi measurably useful.
- **AgentShield security scan** — không critical cho project 1-user, trusted circle. Phase 3+ nếu mở public API.
- **Multi-model orchestration (multi-plan, multi-backend)** — premature. Claude Code 1 agent + sandwich pattern đã đủ.
- **Presentation skills (frontend-slides, investor-materials)** — không liên quan.
- **GitHub Marketplace, installer wizard** — overhead lớn, lợi ích thấp cho personal project.

ECC mang triết lý "everything bundle" — bạn mang triết lý "precision toolkit." Giữ nguyên triết lý.

---

## 4. Khuyến nghị prioritized (theo ROI)

### Tier 1 — làm ngay (high ROI, low risk)

1. **Instincts system** — thiết kế lại agent-notes.md thành observations.jsonl + personal/*.yaml với confidence scoring. Bắt đầu manual (không hook), evolve sau. Ràng buộc: không được conflict `invariants.md`.
2. **Hook runtime profiles** — split pre-commit.example thành minimal/standard/strict + event-based scripts. Dùng `STOCKFORGE_HOOK_PROFILE` env.
3. **Session start/end hooks auto** — port 2 command này thành hook scripts chạy tự động. Giảm HITL một bậc.
4. **Iterative retrieval skill** — 1 skill file, pair với UL glossary, dùng cho sandwich-dev/verifier khi context ambiguity.
5. **Search-first skill** — 1 skill file với block-until-researched behavior. Tốt cho financial domain.

### Tier 2 — đáng làm (medium ROI, medium risk)

6. **Model routing skill + cost-aware budget** — bảng session-type × role → model tier, thêm cost tracking ($) vào `/budget-check`.
7. **`/harness-audit` command** — reflexive scorecard.
8. **Continuous agent loop skill** — cho thesis validation và ingest workflows.
9. **AGENTS.md universal root** — split CLAUDE.md, chuẩn bị cross-harness.

### Tier 3 — cân nhắc (high risk, cần đánh giá)

10. **SQLite state index** — chỉ nếu markdown persistence trở thành bottleneck (query lịch sử thesis chẳng hạn).
11. **Plugin-ification** — tách workflow core khỏi StockForge-specific. Chỉ làm khi có 2+ project dùng cùng workflow.
12. **Evolution pipeline (instincts → auto skill draft)** — chỉ sau khi instincts chạy ≥3 tháng có đủ data.

---

## 5. Triết lý khép lại

ECC là **breadth** — 28 agents, 119 skills, 60 commands, "everything" đúng nghĩa. Starter kit của bạn là **depth** — ít nhưng sâu, opinionated, domain-specific, DDD-native, có constitution.

Đừng cố biến kit của bạn thành ECC. Mượn **mechanisms** (instincts, hooks, iterative retrieval, model routing), không mượn **catalog**. Giữ lại lợi thế so sánh: constitution immutable, UL first-class, dual-layer spec, sandwich pattern explicit, stock-specific invariants. Đó là những thứ ECC không có và không dễ copy.

Một câu hỏi nên tự hỏi trước khi thêm bất kỳ thứ gì từ ECC: *"Cái này enforce một invariant, hay chỉ là một skill tiện tay?"* Ưu tiên enforcement mechanism trước, catalog sau.

Bạn muốn tôi design chi tiết một trong các Tier 1 items (ví dụ: instincts system, hoặc hook profiles) để sẵn sàng triển khai không?

---

# you asked

https://github.com/obra/superpowers với repo này thì sao

---

# claude response

# Phân tích `obra/superpowers` & so sánh với StockForge + ECC

Đây là kho khác hẳn ECC về triết lý, và thực ra **gần gũi hơn nhiều với triết lý starter kit của bạn**. Tôi sẽ phân tích kỹ rồi chỉ ra những gì nên mang về.

## 1. Superpowers khác ECC về bản chất như thế nào

| | **ECC** | **Superpowers** | **StockForge** |
|---|---|---|---|
| Kích thước | 28 agents, 119 skills, 60 commands | ~14 skills, 1 agent | 10 agents, 12 skills, 14 commands |
| Triết lý | "Everything bundle" — breadth | "Disciplined methodology" — depth | "Precision toolkit" — domain-specific |
| Core stance | Tools are tools | **Skills are MANDATORY workflows, not suggestions** | Constitution là immutable rules |
| Đối tượng | General-purpose | Opinionated software lifecycle | Domain-bounded (finance) |
| Star/fork | 166K/25K | 152K/13K | — |

**Kết luận tóm tắt:** ECC cho bạn *mechanisms* (instincts, memory persistence, continuous learning). Superpowers cho bạn *discipline* (gated workflow, TDD-for-skills, rationalization counters). StockForge kit của bạn đang mix cả hai nhưng đang thiên về mechanisms hơn discipline.

## 2. Những ý tưởng lõi của Superpowers

### 2.1 Skills là "mandatory workflow", không phải "suggestion"

Đây là breakthrough lớn nhất. Ngôn ngữ trong `using-superpowers/SKILL.md`:

> *"Even if there's only a 1% chance that a skill applies, the AI agent must invoke it. This is not optional, non-negotiable, and cannot be 'rationalized away.'"*

Flow diagram:
```
User message → "Might any skill apply?"
  ├─ yes, even 1% → MUST invoke Skill tool → announce → follow exactly
  └─ definitely not → respond
```

Combined với explicit **Red Flags** — patterns phải STOP và start over:
- "I already manually tested it" → DELETE CODE, start over
- "Tests after achieve the same purpose" → wrong
- "It's about spirit not ritual" → wrong
- "This is different because..." → wrong

Và **rationalization tables** — trường hợp agent sẽ cố lách rules, với counter explicit. Trong TDD skill có cảnh giả định: *"Production is down. $10k/min lost. Manager says add 2-line fix now. 5 minutes until deploy."* — skill phải resist được áp lực này.

**Tại sao nó work:** Đây là cách bù trừ cho việc LLM có xu hướng "helpful" và rationalize khi bị pressure. Không để agent tự quyết khi nào apply skill — chỉ có "có áp dụng hay không, ngay cả 1%."

### 2.2 Sequential gated workflow

```
brainstorming (Socratic Q&A)
  → using-git-worktrees (isolated workspace)
  → writing-plans (2-5 min micro-tasks)
  → subagent-driven-development (fresh subagent per task, 2-stage review)
  → test-driven-development (RED→GREEN→REFACTOR)
  → requesting-code-review
  → finishing-a-development-branch
```

Mỗi phase là **hard gate** — agent không được skip. Quan trọng: `brainstorming` có dòng:
> *"Do NOT invoke frontend-design, mcp-builder, or any other implementation skill. The ONLY skill you invoke after brainstorming is writing-plans."*

Explicit lock-in terminal states để ngăn plan hopping.

### 2.3 Subagent-driven development với two-stage review — **đây là kiến trúc hay nhất**

Đây là điểm Superpowers đi xa hơn Sandwich Pattern của bạn. Thay vì 1 subagent cho cả session:

```
For each task in plan:
  1. Dispatch fresh IMPLEMENTER subagent (isolated context)
     - Nhận chính xác task text + relevant context, không inherit session history
     - Status signals: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
  
  2. Dispatch fresh SPEC COMPLIANCE reviewer (separate context)
     - Đọc actual code, KHÔNG trust implementer's report
     - Check: spec requirements met? Over-building? Missing?
     - Chỉ pass khi strict compliance
  
  3. IF spec passes → dispatch fresh CODE QUALITY reviewer (separate context)
     - Only runs after spec compliance passes
     - Find actual issues + approved
  
  4. Mark task done in TodoWrite
  5. Next task
```

Ba điểm quan trọng:
- **Context isolation principle**: reviewer không thấy implementer's reasoning → ngăn bias
- **Two stages, không phải one big review**: spec trước, quality sau — tách concern
- **Fresh per task, không fresh per session**: granularity cao hơn

Release notes nói thẳng: *"Won't trust implementer's report — reads actual code."*

### 2.4 Writing-skills với TDD methodology — meta-innovation

Apply RED-GREEN-REFACTOR cho chính việc viết skill:

```
RED: Run pressure scenario với subagent KHÔNG có skill
     → Document exact failure behavior và rationalizations
     → "Watch the test fail"

GREEN: Write skill addressing those SPECIFIC rationalizations
       → Don't add content cho hypothetical cases
       → Chỉ đủ để counter observed failures

REFACTOR: Run same scenarios WITH skill
          → Agent phải comply
          → Nếu còn lách → add explicit counter → re-test bulletproof
```

Core principle: *"If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing."*

Có test categories: academic (agent chỉ recite), realistic pressure (production down, time pressure), edge cases. File structure thực tế:
```
skills/systematic-debugging/
├── SKILL.md
├── CREATION-LOG.md
├── test-academic.md
├── test-pressure-1.md
├── test-pressure-2.md
├── test-pressure-3.md
├── root-cause-tracing.md      # reference loaded on demand
├── defense-in-depth.md
├── condition-based-waiting.md
└── find-polluter.sh
```

### 2.5 Systematic-debugging skill — 4-phase + Phase 4.5

```
Phase 1: Evidence gathering 
  - Log data at EACH component boundary
  - Verify env/config propagation  
  - Check state at each layer
  - Run ONCE to see WHERE it breaks

Phase 2: Pattern analysis
  - Analyze evidence to identify failing component

Phase 3: Hypothesis testing
  - ONE change at a time
  - Verify each hypothesis before moving on

Phase 4: Implementation
  - Mandatory test case that reproduces bug
  - Defense-in-depth validation at multiple layers after fix
  - Root-cause-tracing (backward through call stack)

Phase 4.5: IF 3+ fixes failed
  → STOP. Question the architecture.
  → "This is NOT a failed hypothesis — this is a wrong architecture."
  → Discuss with human before more fixes.
```

Có stop conditions explicit: *"If you see these signs, STOP, return to Phase 1."*

### 2.6 Description-writing discipline (tinh vi nhưng critical)

Phát hiện từ testing:
> *"When a description summarizes the skill's workflow, Claude may follow the description instead of reading the full skill content. A description saying 'code review between tasks' caused Claude to do ONE review, even though the skill's flowchart clearly showed TWO reviews. When the description was changed to just 'Use when executing implementation plans with independent tasks' (no workflow summary), Claude correctly read the flowchart and followed the two-stage review process."*

**Rule:** Description chỉ nói *khi nào* dùng, KHÔNG summarize workflow. Skill body là authoritative source.

### 2.7 Automation-over-documentation meta-rule

Từ RELEASE-NOTES:
> *"Mechanical constraints should be automated, not documented — save skills for judgment calls."*

Nếu có thể wire vào hook thì wire vào hook. Skill chỉ dành cho judgment calls không thể automate được.

### 2.8 SessionStart bootstrap hook

```
<session-start-hook>
<EXTREMELY_IMPORTANT>
You have Superpowers.
**RIGHT NOW, go read**: @/path/to/skills/getting-started/SKILL.md
</EXTREMELY_IMPORTANT>
</session-start-hook>
```

Không phụ thuộc model-judgment có discover skills hay không. Deterministic bootstrap.

### 2.9 Verification-before-completion skill

Short nhưng nặng: sau mỗi implementation, verify với evidence trước khi declare done. Không để agent claim success từ memory/assumption.

---

## 3. So sánh head-to-head: Superpowers vs StockForge kit hiện tại

| Khía cạnh | Superpowers | StockForge |
|---|---|---|
| **Gated workflow sequential** | ✅ brainstorm→plan→impl→review, terminal states | ⚠️ Có phases nhưng không hard-locked |
| **Subagent per-task (không per-session)** | ✅ | ❌ Sandwich là per-session |
| **Two-stage review (spec→quality)** | ✅ | ⚠️ Verifier làm một lần cả hai |
| **Brainstorming Socratic pre-spec** | ✅ | ❌ `spec-author` vào thẳng Part A |
| **Mandatory invocation "1% rule"** | ✅ | ❌ Skills là probabilistic |
| **Rationalization tables + Red Flags** | ✅ explicit | ❌ |
| **TDD-for-skills methodology** | ✅ pressure-tested | ❌ Skills chưa tested |
| **Description discipline** | ✅ no-workflow-summary rule | ❌ Descriptions đang summary |
| **Systematic-debugging 4-phase** | ✅ với Phase 4.5 architecture stop | ❌ |
| **Verification-before-completion** | ✅ | ⚠️ Có VBW (pre-write) nhưng không post-completion |
| **SessionStart bootstrap hook** | ✅ deterministic | ⚠️ `/session-start` thủ công |
| **Automate-mechanical-document-judgment** | ✅ | ⚠️ Skills đang mix cả hai |
| **Git worktrees isolation** | ✅ | ❌ |
| **Micro-tasks 2-5 min** | ✅ | ⚠️ Session plans coarser |
| **Cross-harness (CLAUDE.md + GEMINI.md + AGENTS.md)** | ✅ | ❌ Chỉ CLAUDE.md |

Trong khi đó, **StockForge có mà Superpowers không**:

- Constitution as first-class (invariants, boundaries, VBW protocol)
- Ubiquitous Language / DDD-native
- Dual-layer specs (Part A business / Part B agent contract)
- Domain-specific invariants (I-S1 no-LLM-math)
- Memory MIL pattern (3-tier)
- Session types với budget caps (250K hard cap)
- Numbered drift signals (DR1-DR12) với severity
- Calibration & post-mortem loop cho thesis
- Domain-specific skills (financial-data-protocol, postgres-pgvector, crawler-reliability)

**Kết luận:** Superpowers và StockForge bổ sung nhau rất tốt. Superpowers có **discipline mechanisms** để enforce các rules, StockForge có **domain rules cần enforce**. Cưới chúng lại là nước đi lý tưởng.

---

## 4. Khuyến nghị mang về — prioritized

### Tier 1: làm ngay (rất cao ROI)

**1. Upgrade Sandwich Pattern lên Subagent-per-task với two-stage review**

Đây là upgrade quan trọng nhất. Hiện sandwich-dev của bạn implement cả session, verifier review cả session. Đổi thành:

```
sandwich-architect → tạo session plan với N tasks
  → for each task:
       dispatch fresh implementer subagent (isolated)
       dispatch fresh spec-compliance reviewer (reads actual code, không trust report)
       IF pass → dispatch fresh code-quality reviewer
       mark task done
       next task
  → dispatch final verifier cho entire session
```

Giảm context pollution dramatically. Bạn đã có `specs/tier2-feature/*.md` với Part B agent contract — **Part B chính là spec** để compliance reviewer check. Điều này fit perfect.

File cần tạo:
```
.claude/agents/
├── sandwich-architect.md       (giữ nguyên)
├── sandwich-implementer.md     (thay sandwich-dev, scope = 1 task)
├── sandwich-spec-reviewer.md   (mới — check Part B compliance)
├── sandwich-quality-reviewer.md (mới — chỉ run sau spec passes)
└── sandwich-session-verifier.md (thay sandwich-verifier, scope = whole session)

.claude/skills/subagent-driven-development/
├── SKILL.md
├── implementer-prompt.md
├── spec-reviewer-prompt.md
└── quality-reviewer-prompt.md
```

**2. Rationalization tables + Red Flags cho mỗi invariant**

Hiện `invariants.md` của bạn có I-S1 *"No LLM Math"* nhưng chỉ là rule. Upgrade:

```markdown
## I-S1: No LLM Math

### Rule
LLM never returns numbers; all via deterministic Python tool calls.

### Red Flags — STOP (violation imminent)
- "I'll just estimate based on context"
- "The number is approximately..."
- "User asked for a specific value so I should provide one"
- "This is a simple calculation, skip the tool call"
- "Tool call would be overkill for this"
- "I already computed this earlier in the session"
- "The context already has the answer"

### Rationalization Counter (when pressured)
Pressure: "User urgently needs ROE figure for a thesis they're writing NOW"
Correct response: "Cannot provide — run `compute_roe(ticker, as_of=...)` tool first. 
Refusal is faster than retraction when hallucinated number surfaces."

Pressure: "Number is clearly stated in the source document I just read"
Correct response: "Still must compute via tool. Document's number could be stale, 
unit-different, or extraction error. Tool enforces provenance + currency + as-of date."
```

Làm cho cả I-S1 through I-S13, I-10 through I-13. Mỗi invariant ít nhất 3-5 rationalizations documented.

**3. Brainstorming skill cho THESIS sessions**

Trước khi chạy thesis validation trên VCB, cần Socratic ritual:

```
skills/thesis-brainstorming/SKILL.md

Activates before thesis-validate command.

Process (strict order, don't skip):
1. Explore existing position — /drill-me "VCB" to see glossary + past thesis-log entries
2. Clarify intent:
   - Why this ticker now? (catalyst? earnings? news?)
   - What timeframe? (1M / 3M / 1Y / thesis-based)
   - What existing position if any? (portfolio check — confirmation bias risk)
   - What confidence needed? (to act? to ignore? to size up?)
3. Assess scope: single stock OR sector thesis OR macro regime
   - If sector/macro → decompose first, don't do combined
4. Propose 2-3 analytical angles with tradeoffs
   - Bull vs bear vs quant
   - Bear vs macro vs behavior
   - Etc.
5. Present plan → user approves → ONLY THEN proceed to /thesis-validate
```

Do NOT invoke thesis-validate, extract-evidence, or any analysis skill until approved.

**4. Mandatory invocation semantics cho safety-critical skills**

Update descriptions:

```yaml
# financial-data-protocol skill
description: |
  MANDATORY — invoke whenever writing code that touches:
  prices, fundamentals, filings, KOL recommendations, thesis output,
  backtest queries, or ANY numeric output consumed by users.
  Even 1% chance it applies → MUST invoke.
  Cannot be rationalized away. Non-negotiable.
  Use when encountering data repository code, LLM output involving numbers,
  or any path producing financial figures.
```

Phrasing đánh vào điểm mà LLM có xu hướng rationalize.

**5. Description-writing audit**

Grep tất cả `.claude/skills/*/SKILL.md` descriptions. Rule: description nói *khi nào* dùng, KHÔNG summarize workflow. Hiện tại nhiều skill của bạn summary workflow trong description — sẽ gây agent skip body. Ví dụ fix:

```yaml
# BEFORE — summarizes workflow, Claude có thể skip body
description: |
  Extract structured claims from unstructured sources with citation. 
  Pattern: identify claim, extract source_url, verify, store with extracted_at.

# AFTER — chỉ trigger
description: |
  Use when processing unstructured sources (news articles, KOL transcripts,
  analyst reports) into claims stored in the evidence database. 
  Enforces I-S5 citation integrity. Mandatory for any extraction pipeline.
```

**6. Automate-mechanical-document-judgment audit**

Review các skills và rules hiện có. Rule:
- Mechanical (grep pattern, type check, test pass) → vào hook
- Judgment (is bear case sufficient? is confidence calibrated?) → vào skill

Ví dụ: `DR1` (domain layer framework imports) hiện có trong drift-signals.md. Nó là pure grep → nên tự động fire ở post-edit hook cho `packages/domain/*.py`, không cần đợi `/drift-check` command.

Grep check candidates → move to hooks:
- DR1, DR2, DR3, DR4, DR6, DR8, DR10, DR11
- `mypy --strict` trên changed file
- `ruff check` trên changed file
- `pytest` cho changed BC's test files

Keep in skills:
- DR7 (UL semantic drift — needs human-like inspection)
- DR9 (thesis verifier step — requires judgment)
- DR12 (agent-notes anti-patterns — needs inspection)
- Bear case substantiveness (I-S10 → I-S13)
- Calibration adequacy (I-S7)

**7. Systematic-debugging skill**

Create `.claude/skills/systematic-debugging/SKILL.md` với 4-phase process. Đặc biệt valuable cho:
- Backtest bug (numbers don't reproduce) → Phase 1 evidence gathering at each boundary (data snapshot → repo → compute → result)
- Data pipeline bug → log at component boundaries
- LLM extraction bug → Phase 4.5 hit sau 3 fix thất bại thường có nghĩa là wrong prompt structure, không phải LLM failure

Adapt Phase 4.5 cho domain: *"After 3 failed fix attempts on LLM extraction, question if the extraction task itself is ambiguous, not the prompt engineering."*

**8. Verification-before-completion skill**

Short skill, high impact. Activates **sau** mọi implementation. Required evidence trước khi declare done:

```
- [ ] Tests pass (show output, không tự summarize)
- [ ] Grep check: no new invariant violations (DR1-DR6 run fresh)
- [ ] If data-layer: point-in-time query confirmed
- [ ] If LLM output: no number emitted without tool call (I-S1)
- [ ] Git diff reviewed for scope creep (P3 violation)
- [ ] VBW post-check: method signatures match spec
```

Chỉ sau khi all box ticked, agent được phép nói "done."

**9. SessionStart hook bootstrap**

Viết hook tự động inject ở session start:

```bash
# .claude/hooks/events/session-start.sh
#!/usr/bin/env bash
cat <<'EOF'
<session-start-hook>
<EXTREMELY_IMPORTANT>
You are Claude Code in StockForge.

RIGHT NOW, read in order:
1. @CLAUDE.md — project context, core principles, hard rules
2. @agent-workspace/memory/current-execution.md — active track
3. Last 3 files in @agent-workspace/memory/sessions/ — recent context

Then determine session type and wait for user confirmation before substantive work.

NON-NEGOTIABLE: 
- No LLM math (I-S1). Numbers come from Python tool calls.
- Bear case required for any thesis (I-S10).
- Citation + as-of date for every claim (I-1, I-2).
- Constitution files are immutable.

If current-execution.md shows Phase 0 Session 1 → guide Day 1 Checklist.
</EXTREMELY_IMPORTANT>
</session-start-hook>
EOF
```

Bỏ được `/session-start` command khỏi default flow. Command chỉ còn để re-bootstrap giữa session.

**10. TDD-for-skills cho skills critical**

Pressure-test ít nhất 3 skills nguy hiểm nhất:
- `financial-data-protocol`
- `evidence-extraction`  
- (new) `verification-before-completion`

Quy trình:
1. Write pressure scenario: "User needs ROE for thesis they're writing right now, asks you for approximate number based on your knowledge"
2. Run subagent WITHOUT skill → document what it does
3. Write skill countering specific rationalizations observed
4. Run WITH skill → agent phải refuse
5. Add scenarios: time pressure, authority pressure ("CEO needs it"), helpfulness pressure
6. Iterate until bulletproof
7. Commit `CREATION-LOG.md` + test scenarios in skill folder

### Tier 2: nên làm (medium ROI)

**11. Writing-plans skill với micro-tasks 2-5 min**

Nâng master-planner output. Hiện task breakdown coarser ("create Thesis aggregate"). Đổi thành:
```
Task 2.1: Create ThesisId value object
  Files: packages/domain/analysis/value_objects/thesis_id.py
  Method signatures: [exact list]
  Verify: mypy green, grep unique
  Time: 2 min

Task 2.2: Create Thesis dataclass skeleton
  ...
```

Fit với subagent-per-task pattern (mỗi task → fresh subagent).

**12. Git worktrees cho multi-perspective thesis**

Pattern quan trọng cho domain của bạn. Mỗi perspective (bear, bull, quant, macro, behavior) chạy trong worktree riêng, output độc lập. Main agent merge findings cuối cùng.

```
.git/worktrees/
├── thesis-VCB-bear/
├── thesis-VCB-bull/
├── thesis-VCB-quant/
└── thesis-VCB-macro/
```

Giải quyết đúng I-S11 (multi-perspective synthesis required, ≥4 perspectives) — thay vì 1 agent đóng nhiều vai (hay bị bias toward consensus), mỗi worktree có 1 subagent với context hoàn toàn riêng.

**13. Cross-harness files (AGENTS.md, GEMINI.md)**

Cheap to add. Content = pointers đến CLAUDE.md với tool-mapping notes. Bạn chưa cần dùng Gemini/Codex nhưng future-proof.

### Tier 3: cân nhắc

**14. `/using-superpowers`-style bootstrap doc**

Một skill meta: `using-stockforge` — teach agent cách dùng hệ thống. Explicitly listed nơi skills fire, priority order, escalation paths.

**15. Phase 4.5 architecture question cho thesis post-mortem**

Hiện post-mortem của bạn review thesis outcome. Add: "If thesis failed mode repeat 3 times trong 6 tháng, question architecture — không phải fix individual thesis parameters."

---

## 5. Summary comparison: ECC vs Superpowers — nên cưới cái nào cho StockForge?

| Concept | Nguồn tốt hơn | Lý do |
|---|---|---|
| Instincts / continuous learning | **ECC** | Mechanism chi tiết, confidence scoring |
| Hook profiles / runtime control | **ECC** | ECC_HOOK_PROFILE=minimal/standard/strict |
| Iterative retrieval | **ECC** | Formalized 4-phase pattern |
| Model routing | **ECC** | Explicit cost-tier |
| Continuous agent loop | **ECC** | Generic pattern |
| Search-first research ritual | **ECC** (fact-forcing gate) | +2.25 pts measured |
| Harness-audit reflexivity | **ECC** | `/harness-audit` command |
| **Subagent-per-task + 2-stage review** | **Superpowers** | Granularity + context isolation |
| **Mandatory invocation + Red Flags** | **Superpowers** | Language mechanism chống rationalization |
| **TDD-for-skills methodology** | **Superpowers** | Unique, pressure-tested skills |
| **Systematic-debugging 4-phase** | **Superpowers** | Phase 4.5 architecture question |
| **Verification-before-completion** | **Superpowers** | Simple but powerful |
| **Description-writing discipline** | **Superpowers** | Subtle, measured impact |
| **Automate-mechanical-document-judgment** | **Superpowers** | Cleanup rule |
| **Brainstorming Socratic** | **Superpowers** | Gated workflow start |
| **SessionStart bootstrap** | Cả hai | Simple enough |
| **Git worktrees** | **Superpowers** | Multi-perspective fit StockForge |

---

## 6. Triết lý cuối

ECC dạy bạn *"đo lường và tự động hoá observation"*. Superpowers dạy bạn *"enforce discipline, không rationalize được"*. StockForge kit của bạn đang có foundation mạnh (constitution, UL, invariants) — nhưng thiếu **enforcement language** và **granularity** ở execution layer.

Bạn nên:
1. Giữ StockForge core (constitution, UL, dual-spec, 9 BCs, I-S invariants)
2. Mượn **mechanisms từ ECC** (instincts, hooks profiles, model routing)
3. Mượn **discipline patterns từ Superpowers** (subagent-per-task, rationalization counters, TDD-for-skills, systematic-debugging, brainstorming gate)

Ranking 3 items tôi sẽ làm đầu tiên nếu tôi là bạn:
1. **Subagent-per-task + two-stage review** (upgrade sandwich) — biggest architectural win, fit hoàn hảo với Part B specs của bạn
2. **Rationalization tables cho I-S invariants** — cheap to add, trực tiếp enforce hard rules trong domain tài chính
3. **TDD-for-skills trên financial-data-protocol** — pressure-test skill quan trọng nhất, bạn sẽ tìm ra loopholes bạn chưa biết

Bạn muốn tôi prototype cụ thể 1 trong 3 items trên không (ví dụ: viết full file set cho subagent-per-task pattern, hoặc tạo rationalization tables cho I-S1/S2/S3)?

---

# you asked

còn repo này: https://github.com/garrytan/gstack

---

# claude response

# Phân tích `garrytan/gstack` & so sánh với StockForge + các repo trước

Gstack là repo thứ 3 trong bộ so sánh của bạn, và nó mang về một **góc nhìn rất khác** với ECC và Superpowers — không phải là breadth catalog (ECC), cũng không phải là discipline methodology (Superpowers), mà là **role-based sprint cycle**.

## 1. Gstack khác ECC và Superpowers như thế nào

| Dimension | ECC | Superpowers | **Gstack** | StockForge |
|---|---|---|---|---|
| Triết lý | Tools everywhere | Mandatory gated workflow | **Role specialization + sprint cycle** | Constitution + domain rules |
| Unit of work | Skill | Skill (mandatory) | **Specialized role (CEO/Eng/QA/Designer/CSO)** | Subagent |
| Workflow shape | Unstructured catalog | Linear hard gates | **7-stage sprint: Think→Plan→Build→Review→Test→Ship→Reflect** | Phase-based với sandwich |
| Author bias | Pragmatic engineer | Dogmatic methodologist | **Founder/CEO mindset** | DDD practitioner |
| Target user | Any developer | Serious engineer | **Solo/small-team builder** | Single-user domain expert |

**Insight quan trọng:** Gstack là cái cầu giữa ECC và Superpowers. Nó có **role structure** mạnh hơn Superpowers (23 roles cụ thể) nhưng **ít cứng nhắc** hơn Superpowers (không phải mandatory workflow, dùng config để bật tắt).

Có 1 blog post hay so sánh cả 3 (`dev.to/imaginex`): *"Superpowers executes, gstack decides, GSD stabilizes specs."* Tức gstack là **decision layer** — phần "suy nghĩ như founder/CEO trước khi code."

---

## 2. Những ý tưởng lõi của gstack

### 2.1 Role-based specialization — "explicit gears"

Triết lý thẳng từ README:
> *"Planning is not review. Review is not shipping... I want explicit gears."*

23 skills, mỗi cái là **1 cognitive mode riêng biệt**:

| Role | Skill | Purpose |
|---|---|---|
| **CEO** | `/office-hours`, `/plan-ceo-review` | Scope, "worth building?", think bigger |
| **Eng Manager** | `/plan-eng-review` | Architecture, data models, edge cases, failure modes |
| **Designer** | `/design-consultation`, `/plan-design-review`, `/design-shotgun` | Design system, AI slop detection, UX spec |
| **Staff Engineer** | `/review` | Pre-landing PR review, production bugs, complexity |
| **QA Lead** | `/qa`, `/investigate` | Browser-based real-world testing, bug triage |
| **Release Manager** | `/ship`, `/land-and-deploy`, `/canary` | Sync, test, coverage, PR, deploy, monitor |
| **Doc Engineer** | `/document-release` | Post-ship doc update |
| **Security Officer** | `/cso` | OWASP + STRIDE threat modeling |
| **Retrospector** | `/retro` | Weekly/global retrospective |

Mấu chốt: mỗi role **không overlap nhau**. CEO không review code, Designer không review architecture, Eng không review scope. Đây là **enforcement qua separation of concerns** ở cấp cognitive mode, không phải tool level.

### 2.2 7-stage sprint cycle với smart review routing

```
Think → /office-hours (forcing questions)
Plan  → /plan-ceo-review (scope)
      → /plan-eng-review (architecture — BẮT BUỘC, gate shipping)
      → /plan-design-review (UX — optional, judgment)
      → /plan-devex-review (DX — optional)
      → /autoplan (run all)
Build → normal coding
Review → /review (staff engineer perspective)
       → /codex (independent Codex CLI review)
       → [adversarial always-on]
Test  → /qa (real browser with fix loop)
Ship  → /ship (sync + test + coverage + PR)
      → /land-and-deploy (merge + deploy + verify)
Reflect → /retro (weekly)
```

**Smart review routing**:
- Eng review = **required by default** (only review that gates shipping)
- CEO review = optional, judgment — recommend cho big product/business changes, skip cho bug fixes/refactors/infra
- Design review = optional, judgment — recommend cho UI/UX changes, skip cho backend/prompt-only
- Adversarial review = **automatic, always-on** (every diff, Claude adversarial + Codex adversarial)
- Large diff (200+ LOC) = **additional** Codex structured review với P1 gate

Config `skip_eng_review true` là "don't bother me" override. Author thẳng thừng: "defaults reflect how I work; tune to your flow."

### 2.3 The Confusion Protocol

Đây là pattern ngắn nhưng cực kỳ giá trị. Khi agent không chắc về architectural decision → **stop and ask, don't guess**. Pair với Karpathy P1 (Think Before Coding) nhưng xử lý cụ thể trường hợp confusion vs assumption. Agent bị training để helpful nên có xu hướng guess chứ không stop.

### 2.4 Continuous checkpoint mode — survive crashes

```
gstack-config set checkpoint_mode continuous
```

Tự động commit khi làm việc với `WIP:` prefix + structured body:

```
WIP: Add thesis validation pipeline for VCB

[gstack-context]
decisions:
  - Chose get_as_of() over get_latest() per I-S2
  - Skipped macro perspective (Phase 3+ feature)
remaining_work:
  - Wire bear-case generator
  - Add calibration lookup
failed_approaches:
  - Tried single-LLM multi-perspective — bias toward consensus
  - Tried sequential perspectives — lost independence
budget_consumed: 127K / 250K
```

`/context-restore` đọc commits này để reconstruct state sau crash hoặc context-window cliff. `/ship` **filter-squashes** WIP commits trước khi tạo PR (giữ non-WIP commits để bisect vẫn clean). Push opt-in (`checkpoint_push=true`) để không spam CI.

### 2.5 Interactive STOP + AskUserQuestion pattern

Từ `/plan-ceo-review` skill:
> *"If the section has findings, you MUST call AskUserQuestion as a tool_use — a finding with an 'obvious fix' is still a finding and still needs user approval before any change lands in the plan. Do NOT proceed until the user responds."*

Review không dump big report cuối cùng. Mỗi finding = một STOP + AskUserQuestion. User walk through từng issue với explicit approve/reject. Tạo structured HITL thay vì ad-hoc.

### 2.6 Spawned session detection — **pattern quan trọng nhất cho goal full-automation của bạn**

```
IF SPAWNED_SESSION=true (inside orchestrator e.g. OpenClaw):
  - DO NOT use AskUserQuestion (auto-choose recommended option)
  - Skip upgrade checks, telemetry prompts, routing injection
  - Focus on completing task + reporting results
  - END with completion report: what shipped, decisions, uncertainties
```

Dual-mode: **interactive** vs **orchestrated**. Cùng skill, cùng prompt, chỉ khác mode. Đây là cơ chế để orchestrator spawn sub-sessions không HITL, trong khi giữ interactive cho human-driven session.

### 2.7 Cross-model adversarial review

Mọi review tự động chạy:
- Claude adversarial subagent (built-in)
- Codex adversarial challenge (từ OpenAI Codex CLI)
- Large diff: + Codex structured với P1 gate

Bonus: gstack ship **cross-model benchmark CLI** độc lập — chạy cùng 1 prompt qua Claude, GPT, Gemini, so sánh latency/tokens/cost/(optional) LLM-judge quality.

### 2.8 Taste learning with decay

`/design-shotgun` generates 3 variants, user pick via browser. Approvals/rejections write to per-project **taste profile**. Decay 5%/week. Feed back vào variant generation tiếp theo.

Decay model quan trọng: old preferences matter less than new ones. Phù hợp với thay đổi sở thích theo thời gian.

### 2.9 Proactive natural-language routing

Gstack không bắt user nhớ command. Natural language → skill:

```
"wtf this is broken"     → /investigate
"does this work"         → /qa
"look at my changes"     → /review
"send it"                → /ship
"save my work"           → /context-save
"where was I"            → /context-restore
"how'd we do this week"  → /retro
"is this secure"         → /cso
```

Plus voice triggers (STT aliases): *"quality check"*, *"test the app"*, *"run QA"*.

### 2.10 Weekly retro với compounding learnings

`/retro` weekly:
- Per-person breakdowns (team mode)
- Shipping streaks
- Test health trends
- Growth opportunities
- `/retro global` runs across **all projects and all AI tools** (Claude Code, Codex, Gemini) — cross-tool retrospective

Plus: `gstack-learnings` manages patterns/pitfalls/preferences learned — reviewable, searchable, prunable, exportable. *"Learnings compound across sessions so gstack gets smarter on your codebase over time."*

---

## 3. So sánh 3 repos head-to-head cho StockForge

| Concept | **ECC** | **Superpowers** | **Gstack** | Fit cho StockForge |
|---|:-:|:-:|:-:|---|
| Mandatory skill invocation (1% rule) | — | ✅ | — | Superpowers win |
| Instincts / auto-observation hooks | ✅ | — | — | ECC win |
| TDD-for-skills methodology | — | ✅ | — | Superpowers win |
| Subagent-per-task two-stage review | — | ✅ | ⚠️ | Superpowers win |
| **Role specialization (CEO/Eng/QA/CSO)** | — | — | ✅ | **Gstack win** |
| **Sprint cycle với smart review routing** | — | ⚠️ linear | ✅ với branching | **Gstack win** |
| **Checkpoint-continuous mode** | ✅ SQLite | — | ✅ git commits | **Gstack win (git-native)** |
| **Spawned session dual-mode** | — | — | ✅ | **Gstack win** |
| **Proactive NL routing** | — | — | ✅ | **Gstack win** |
| **Interactive STOP+AskUserQuestion** | — | ⚠️ | ✅ explicit | **Gstack win** |
| **Adversarial always-on** | ⚠️ | ✅ | ✅ cross-model | **Gstack win** |
| **Weekly cross-project retro** | — | — | ✅ | **Gstack win** |
| Brainstorming Socratic | — | ✅ | ✅ /office-hours | Cả hai |
| Hook runtime profiles | ✅ | — | ⚠️ config | ECC win |
| Model routing | ✅ explicit | — | ✅ per-skill | Cả hai |
| Bootstrap SessionStart hook | ⚠️ | ✅ | ⚠️ | Superpowers win |
| Rationalization counters | — | ✅ | — | Superpowers win |
| Continuous learning / taste learning | ✅ instincts | — | ✅ decay model | ECC + Gstack |
| Cross-harness support | ✅ | ✅ | ⚠️ CC-only | Tie |

**Kết luận thắt chặt:** Mỗi repo thắng ở một dimension khác nhau. Không có repo nào "tốt nhất". Cần pick-and-mix.

---

## 4. Những ý tưởng gstack đáng mang về StockForge — prioritized

### Tier 1 — Tác động lớn, fit domain

**1. Role-based subagent specialization — biggest architectural insight**

Hiện subagents của bạn (master-planner, sandwich-architect, sandwich-dev, sandwich-verifier, devils-advocate, drift-detector, ul-auditor, bdd-planner, action-guide-planner, spec-author) **tất cả đều là engineering roles**. Thêm các role cao hơn:

```
.claude/agents/
├── [existing engineering roles...]
├── thesis-ceo.md          # Scope decisions: "is this thesis worth running?"
│                          # Timeframe? Existing position? Confidence needed?
├── thesis-analyst.md      # Analytical framework designer — analog /plan-eng-review
├── thesis-risk-officer.md # Portfolio concentration audit, position sizing sanity,
│                          # calibration audit — analog /cso
├── thesis-qa.md           # Source validation: every claim has citation? 
│                          # Every number from tool call? Bear case substantive?
│                          # analog /qa but for evidence not UI
└── retrospector.md        # Weekly retro across thesis outcomes
                           # calibration drift, KOL score shifts — analog /retro
```

Mỗi role có **persona**, **narrow scope**, **không overlap**. THESIS session sẽ gate qua: thesis-ceo (scope) → thesis-analyst (framework) → [execute] → thesis-qa (source valid) → thesis-risk-officer (portfolio safety) → log.

**2. Sprint cycle cho THESIS workflow**

Thay vì 1 THESIS session monolithic 60-100K, decompose thành sprint:

```
Think   → /thesis-office-hours (forcing questions):
            - Why this ticker now?
            - What catalyst?
            - What timeframe?
            - What existing position (confirmation bias risk)?
            - What confidence needed to act?

Plan    → /thesis-plan-scope-review (CEO: is scope right?)
        → /thesis-plan-framework-review (Eng: is analytical framework sound?)
        → [auto-skip calibration review nếu thesis chỉ research, không trade]

Build   → run multi-perspective analysis (bear/bull/quant, Phase 3+ macro/behavior)

Review  → /thesis-code-review (provenance, citation integrity)
        → [adversarial always-on: 2nd Claude does independent bear case + Codex adversarial]
        → /thesis-risk-review (portfolio sanity, concentration, calibration)

QA      → /thesis-qa: every number traces to tool call? 
                     every claim has source_url + as-of?
                     bear case ≥3 distinct points?

Ship    → /thesis-log (append to thesis-log/, schedule 6-month post-mortem)

Reflect → /retro weekly (post-mortem outcomes, calibration drift)
```

Điều này aligning với I-S10 (bear case required), I-S11 (multi-perspective), I-S12 (disagreement surfaced), I-S26 (post-mortem scheduled). Sprint cycle enforce invariants qua structure chứ không qua rule text.

**3. Spawned session mode — `STOCKFORGE_SPAWNED=true`**

Đây là mechanism enable full-automation của bạn.

```bash
# Orchestrator dispatch subagent với env var
STOCKFORGE_SPAWNED=true claude-code run thesis-validate VCB
```

Trong mọi skill + command, thêm check đầu:
```markdown
## Spawned session handling
If env STOCKFORGE_SPAWNED=true:
- DO NOT call AskUserQuestion (auto-choose recommended)
- Skip /session-start ceremony
- Skip telemetry prompts
- End with STRUCTURED completion report:
  - What was done
  - Decisions made (with rationale)
  - Uncertainties flagged
  - Invariant checks passed/failed
  - Next action recommendation
```

Orchestrator (main Claude) đọc completion report, route to next step. Không HITL. Interactive mode giữ cho session human-driven.

Đây là điểm mà gstack thắng Superpowers và ECC: cả hai đều assume interactive. Gstack acknowledge nhu cầu orchestration, cho spawned sessions first-class citizen.

**4. Continuous checkpoint mode với structured commits**

```bash
stockforge-config set checkpoint_mode continuous
```

Auto-commit với:
```
WIP: [Task 2.3] implement Thesis aggregate submit()

[stockforge-context]
session_type: FOCUSED_IMPL
session_plan: 003-thesis-aggregate-implementation.md
current_task: 2.3 of 5
decisions:
  - Substantive bear case = ≥3 distinct points (per I-S10)
  - submit() transitions DRAFT→REVIEW, requires bear_case+bull_case
remaining:
  - Task 2.4: wire events
  - Task 2.5: repository adapter
failed_approaches:
  - Tried polymorphic bear/bull case — over-abstracted (P2 violation)
budget_consumed: 87K / 150K
invariants_touched: [I-S10, I-10, I-11]
```

Lợi ích:
- Crash recovery tự nhiên (git là source of truth)
- `/context-restore` đọc commits để reconstruct
- `/session-end` filter-squash trước khi finalize
- Bridges problem "session-end interrupted, context lost"

Khác ECC's SQLite approach: git-native = diffable, reviewable, trong version control, không cần DB.

**5. Interactive STOP + AskUserQuestion cho Tier 3 human gates**

Hiện Tier 3 gates (thesis quality review, calibration sign-off, architectural decision) của bạn là ad-hoc. Format gstack:

```markdown
# thesis-quality-review skill

For each finding in review:
  → Use AskUserQuestion tool (NOT just text prompt)
  → Present: finding + severity + evidence + recommended action + alternatives
  → Wait for explicit response
  → Do NOT proceed to next finding until answered
  → A finding with "obvious fix" is STILL a finding — no auto-fix

After all findings processed:
  → Summary report
  → Next-step recommendation
```

Điều này cải thiện "HITL where needed" — human intervention có structure thay vì narrative.

**6. Proactive NL routing hints trong CLAUDE.md**

Thêm mapping table vào CLAUDE.md hoặc skill gốc:

```
User says                                    → Invoke
─────────────────────────────────────────────────────────────
"research X" / "is X worth buying?"          → /thesis-office-hours
"should I worry about Y"                     → /thesis-risk-review
"check this thesis"                          → /thesis-review
"save my progress" / "checkpoint"            → /context-save
"where was I" / "resume"                     → /context-restore
"what did I learn this week"                 → /retro
"ingest this source"                         → /wiki-ingest
"is this data pipeline broken"               → /investigate
"drill domain"                               → /drill-me
"audit language drift"                       → /ul-audit
"scan for architectural decay"               → /drift-check
```

Giảm cognitive load. User không nhớ command, skill tự fire.

**7. Adversarial always-on (cross-model nếu có)**

Hiện devils-advocate là on-demand. Chuyển thành always-on cho:
- Mọi THESIS session (enforce I-S10 bear case)
- Mọi SPEC creation (trước khi lock specs/tier2-feature/NNN.md)
- Mọi calibration change

Bonus cross-model nếu bạn có Codex/Gemini CLI: independent bear case. Bear case từ Claude + bear case từ Codex → surface disagreement (I-S12).

**8. Weekly retro + compounding learnings**

Thêm `/retro` command + `stockforge-learnings` store:

```
~/.stockforge/learnings/
├── patterns/        # successful patterns worth formalizing
├── pitfalls/        # anti-patterns observed
├── preferences/     # user preferences (thesis style, framing, length)
└── calibration-log/ # weekly drift measurements
```

Plus weekly retro output:
- Theses completed this week
- Calibration drift (predictions vs outcomes cho 6M-old theses đến hạn)
- KOL credibility score shifts
- Session efficiency trends (tokens/task, rework rate)
- Invariant violations detected + resolutions

Compounds data over time, không thay thế post-mortem-per-thesis mà bổ sung cross-sectional view.

### Tier 2 — Đáng làm

**9. Confusion Protocol**

Thêm vào constitution hoặc 1 skill riêng. Khi agent "confused" về: architectural decision / spec ambiguity / data source choice / invariant conflict → **STOP, don't guess, ask**.

Phối hợp với existing VBW protocol (pre-spec/pre-test/pre-code). Confusion Protocol là meta-level handler cho *unclear* situations — VBW assume bạn biết mình cần verify gì; Confusion handles khi bạn không biết.

**10. Taste learning cho KOL + signal tuning (với decay)**

Không phải cho design. Apply cho:
- **KOL credibility scoring**: mỗi thesis outcome là signal — KOL dự đúng → confidence lên, sai → xuống. Decay theo thời gian (market regime change).
- **Signal weight tuning**: multi-perspective aggregation weights adjust theo post-mortem outcomes. Decay.
- **Confidence calibration**: historical hit rate at confidence level X — decay so KOL credibility từ 2021 không dominate 2024.

Mapping direct sang I-S7 (confidence = hit rate, not feeling).

**11. Deploy configurator analog — "thesis publishing configurator"**

Không cần cho deployment. Nhưng `/setup-thesis-output`: one-time config cho:
- Output format preference (Streamlit card / PDF / Slack alert)
- Disclaimer template (I-S35)
- Notification routing
- Dashboard integration path

### Tier 3 — Skip hoặc defer

- Design skills (`/design-consultation`, `/design-shotgun`, `/design-html`) — không relevant
- Browser eyes (`/qa` web-based) — thay bằng "evidence QA" thuần text
- `/land-and-deploy` — StockForge self-use, không production deployment
- GStack Browser sidebar — niche
- Team-mode retro — 1 user, không cần

---

## 5. Pattern tổng quát — cách pick-and-mix 3 repos

Bạn đang chọn giữa 3 triết lý. Đây là mapping kinh nghiệm tôi recommend:

```
StockForge constitution (foundation)
          │
          ├── MECHANISMS từ ECC
          │    • Instincts/observations.jsonl
          │    • Hook profiles (minimal/standard/strict)
          │    • Model routing explicit
          │    • Iterative retrieval pattern
          │    • Harness audit
          │
          ├── DISCIPLINE từ Superpowers
          │    • Subagent-per-task + 2-stage review
          │    • Mandatory invocation (1% rule) với Red Flags
          │    • Rationalization counters cho I-S invariants
          │    • TDD-for-skills methodology
          │    • Systematic debugging 4-phase + Phase 4.5
          │    • Verification-before-completion
          │    • Description discipline (no workflow summary)
          │    • Brainstorming Socratic pre-spec
          │    • SessionStart bootstrap deterministic
          │
          └── ROLES + SPRINT từ Gstack
               • Role specialization (CEO/Analyst/Risk/QA/Retrospector)
               • 7-stage sprint cho THESIS workflow
               • Spawned session dual-mode ⭐ (critical cho full-automation)
               • Continuous checkpoint với structured commits
               • Interactive STOP+AskUserQuestion
               • Proactive NL routing
               • Adversarial always-on cross-model
               • Weekly retro + compounding learnings
               • Confusion Protocol
               • Taste learning với decay (KOL + calibration)
```

---

## 6. Top 3 items tôi sẽ làm đầu tiên từ gstack

Nếu phải pick 3 từ gstack (cộng với items từ 2 repo trước):

**#1: Spawned session dual-mode (`STOCKFORGE_SPAWNED=true`)**

Đây là **mechanism quan trọng nhất** cho goal "loại bớt human-in-the-loop." Tất cả các pattern khác đều assume interactive; spawned mode mới cho phép orchestrator thực sự autonomous. Pair tốt với sandwich-per-task pattern từ Superpowers.

**#2: Role specialization cho THESIS workflow**

CEO/Analyst/Risk-Officer/QA/Retrospector sub-agents cho thesis lifecycle. Biến THESIS session từ monolithic 60-100K thành chained sprint có role clarity. Giải quyết điểm yếu hiện tại: thesis session của bạn chỉ có engineering perspective.

**#3: Continuous checkpoint với structured commits**

Giải quyết problem "session crash = lost context" không cần SQLite infrastructure (như ECC). Git-native, diffable, integrates natively với existing workflow. Pair với `/context-restore`, bridges session boundaries tốt hơn hiện tại.

---

## 7. Một quan sát về author bias của gstack

Gstack có **strong opinion** từ perspective founder/CEO (Garry Tan runs YC). Nó biases toward:
- Shipping velocity (LOC/week metrics)
- User-first thinking
- "Is it worth building?"
- Rapid iteration

StockForge domain rất khác: **decision quality > velocity**. Một thesis sai là real money lost, không recoverable bằng "ship fast and iterate." Vì vậy khi port patterns từ gstack:

- `/plan-ceo-review` analog: thay "is this worth building" bằng "is this thesis worth running *at this quality level*" — đừng inherit velocity bias.
- `/ship` analog: thay "move fast" bằng "log with provenance" — một thesis log entry là irreversible record.
- `/retro` global: include calibration drift, không chỉ shipping streaks.

Gstack author explicitly nói: *"defaults reflect how I work; tune to your flow."* Take the structure, adapt the judgment.

---

## 8. Câu hỏi tự hỏi trước khi adopt thêm bất kỳ pattern nào

Từ 3 repos này, tôi extract 1 meta-rule: **"Is this a mechanism, a discipline, or a role?"**

- Mechanism (hooks, instincts, checkpoints) → lightweight infrastructure, cheap to add
- Discipline (rationalization counters, mandatory invocation) → requires buy-in, enforcement
- Role (CEO/QA/CSO personas) → structural, affects architecture

StockForge đã mạnh về mechanism (constitution, memory, hooks khung). Cần bù:
- **Discipline mechanisms**: thêm vô I-S invariants → làm hard rules stick
- **Role structure**: thêm vô THESIS workflow → làm thinking modes explicit

Đây là gap chính của kit hiện tại. 3 items Tier 1 ở trên đánh trúng gap này.

---

Bạn muốn tôi prototype cụ thể 1 trong 3 items không? Tôi đề xuất **spawned session dual-mode** vì nó là enabling mechanism cho tất cả các pattern khác — không có spawned mode, các role subagents không thể orchestrate autonomous. Hay là bạn muốn tôi tổng hợp 1 roadmap combined từ cả 3 repos thành implementation plan có thứ tự?