# Phase 8.0.2 -- OSS Config Layering + Community-Readiness Patterns

Authored: 2026-04-27
Analyst: research-scanner (sonnet)
Feeds: substage 8.7.1 architect decision, SC-46 community-readiness
Sources surveyed: 7 (5 existing notes + 2 web-fetch)

---

## S1 Summary

Seven sources surveyed: Claude Code official docs (web-fetch), claudegram, claude-to-im, claudekit, praktor, nanoclaw, claudekit-skills.

**Patterns recommended BORROW (5):**
1. Claude Code 4-scope layering (managed > local > project > user) with array-concat merge.
2. Zod-validated config schema from claudegram -- type safety at parse time, not runtime.
3. Hook-per-scope from Claude Code official -- hooks at user, project, local, managed independently.
4. Progressive-disclosure skill structure from claudekit-skills (SKILL.md + references/ + scripts/).
5. Profile.yaml project-registration (existing) -- extend with user-profile.yaml + system-defaults/.

**Patterns recommended REJECT (3):**
1. OS-level managed policies (MDM plist / Windows registry) -- enterprise complexity, zero value for personal + small-team use case.
2. File-polling hot-reload (praktor) -- 40-LOC complexity solved by daemon restart; defer to v2.4.
3. Telemetry opt-out default -- for community OSS, opt-in is the only ethical default.

---

## S2 Config Layering Patterns

### 2.1 Source Comparison

| Source | Layers | Merge order (highest wins) | Schema | Our take |
|---|---|---|---|---|
| Claude Code official (code.claude.com/docs/en/settings) | managed / local-project / shared-project / user | managed > CLI args > .claude/settings.local.json > .claude/settings.json > ~/.claude/settings.json | JSON + schemastore ref | BORROW: exact model for orch 4-scope |
| claudegram (research/claudegram.md:config.ts:13-232) | env-only single scope | Zod parse at startup; exit on failure | Zod typed | BORROW: Zod validation pattern |
| claude-to-im (research/claude-to-im.md) | DI context singleton; no layering | globalThis key | TS interface | LEARN: DI context mechanism |
| claudekit (research/claudekit-docs.md) | project .claude/ only; no user-level | single scope; no merge | Markdown + hooks | LEARN: skill/workflow delegation |
| praktor (research/praktor.md) | Go config struct; hot-reload file poll | file reload replaces struct | Go struct + Viper | SKIP: Go-specific; over-engineered |
| nanoclaw (research/nanoclaw.md) | import-based channel toggle; no config files | code change + restart | hardcoded | REJECT: config-as-code anti-pattern |
| claudekit-skills (research/claudekit-skills.md) | plugin.json manifest per category | alphabetical merge | JSON manifest | LEARN: premature for v1 |

### 2.2 Claude Code Official -- Exact Scope File Paths

Source: code.claude.com/docs/en/settings (web-fetched 2026-04-27).

Managed scope file paths:
- macOS: /Library/Application Support/ClaudeCode/managed-settings.json
- Linux/WSL: /etc/claude-code/managed-settings.json
- Windows: C:\Program Files\ClaudeCode\managed-settings.json
- Drop-in: managed-settings.d/*.json (alphabetical merge on base file)

User scope: ~/.claude/settings.json
Project (shared, committed): .claude/settings.json
Local (personal, gitignored): .claude/settings.local.json

Memory files: ~/.claude/CLAUDE.md / CLAUDE.md or .claude/CLAUDE.md / CLAUDE.local.md

Merge rule: array-valued keys (permissions.allow, permissions.deny, sandbox.filesystem.allowWrite)
concatenated + deduplicated across all scopes. Scalar keys: last-wins-highest-scope.

### 2.3 Proposed Orch 4-Scope Mapping

```
system   -> packages/core/src/config/defaults.yaml         (shipped; immutable by user)
user     -> ~/.orch/settings.yaml                           (personal global; gitignored)
project  -> <project>/.orch/profile.yaml                    (existing; extend schema)
local    -> <project>/.orch/profile.local.yaml              (personal override; add; gitignored)
```

Memory files:
- ~/.orch/ORCH_CONTEXT.md            (user-global)
- <project>/.orch/CONTEXT.md         (project; committed)
- <project>/.orch/CONTEXT.local.md   (personal; gitignored)

Telemetry opt-in: user-scope only (settings.yaml: upstream_sync: true). Must not be in project scope.

---

## S3 OSS Housekeeping Patterns

| Source | License | CONTRIBUTING | CODE_OF_CONDUCT | SECURITY | Issue templates |
|---|---|---|---|---|---|
| claudegram | MIT | No | No | No | No |
| claude-to-im | MIT | No | No | No | No |
| praktor | MIT | No | No | No | No |
| nanoclaw | MIT | No | No | No | No |
| claudekit-skills | MIT | Implicit PR only | No | No | No |
| claudekit-docs | Commercial SaaS | n/a | n/a | n/a | Support email |

Finding: None of the surveyed personal-tool repos implement full OSS housekeeping.
Orch must establish these from scratch for community-readiness.

**LICENSE recommendation: MIT (keep existing).**
Rationale: all five OSS reference repos use MIT. MIT is maximally permissive, well-understood
by Claude Code users, zero contribution friction, and already declared in orch LICENSE.
Apache-2.0 adds patent clause complexity with no benefit for a personal tool without patents.

**Minimum OSS housekeeping checklist for 8.7 (6 files):**
- CONTRIBUTING.md -- 1 page: fork/branch/PR convention; pointer to coding-principles
- CODE_OF_CONDUCT.md -- adopt Contributor Covenant 2.1 verbatim (zero authoring cost)
- SECURITY.md -- private disclosure email; no bug bounty; 48h response SLA
- .github/ISSUE_TEMPLATE/bug_report.md -- 5 fields: version, OS, steps, expected, actual
- .github/ISSUE_TEMPLATE/feature_request.md -- 3 fields: problem, solution, alternatives
- .github/pull_request_template.md -- checklist: task link, test plan, charter-compliance note

---

## S4 Telemetry / Phone-Home Patterns

**Claude Code official (inferred from claude-code-learn.md + hooks doc web-fetch):**
- Telemetry present. Opt-in via CLAUDE_CODE_ENABLE_TELEMETRY=1.
- Wire format: internal Anthropic sink; not documented publicly.
- OTEL endpoint: configurable via OTEL_EXPORTER_OTLP_ENDPOINT.
- Usage fields: message.usage.input_tokens, output_tokens, cache_read_input_tokens
  -- already consumed by orch budget watchdog (scripts/hooks/budget-watchdog.sh).

**Orch existing OTEL pipeline (otel-tracing SKILL.md):**
- ORCH_OTEL_ENDPOINT -> OTLP exporter target.
- Spans: orch.session, orch.task, orch.worker.spawn.
- This is the correct seam for upstream-sync.

**Proposed orch community telemetry design:**

```
Local collect  -> OTLP -> local Jaeger/Prometheus (always on; private)
Upstream sync  -> opt-in: upstream_sync: true in ~/.orch/settings.yaml
               -> HTTPS POST to orch-telemetry endpoint
               -> wire: OTLP/JSON (reuses existing otel-tracing pipeline)
               -> redact: project names, file names, prompt text
               -> hash: session IDs
```

Default: upstream_sync unset (disabled). Opt-in mandatory.
Wire format reuses existing otel-tracing pipeline -- zero new wire format code needed.

No surveyed repo implements working opt-in upstream-sync for personal tools. Original design for orch.

---

## S5 Domain-Workflow Positioning

User brief S1.7 (paraphrased): orch should position as domain workflow autonomous knowledge expert --
not a domain content expert, but an expert on workflow patterns within a domain. Coding is domain #1.

| Project | Self-framing | Domain-workflow claim? |
|---|---|---|
| claudegram | Telegram bot for Claude Code | No |
| claude-to-im | IM bridge library | No |
| praktor | Personal AI agent daemon | No |
| nanoclaw | Personal AI assistant | No |
| claudekit | Engineering workflow layer over Claude Code | Closest -- workflow scaffolding framing |
| claudekit-skills | Community skill library | Domain-specific skills; no autonomous-workflow framing |
| Claude Code official | Agentic coding tool | No |

Finding: No prior art for the exact positioning user brief S1.7 describes.
Claudekit is closest (workflow scaffolding) but does not frame itself as workflow-knowledge
collector or self-improving from usage data. Orch can own this position cleanly.

Implications for 8.7.1:
- README.md: replace orchestration daemon framing with autonomous coding workflow expert
  that self-improves from practice.
- PROJECT_CHARTER.md S Vision: add domain-workflow positioning (current dumb-scheduler framing undersells).
- CONTRIBUTING.md: frame contributors as contributing workflow patterns, not just code.
- Telemetry schema: collect workflow event sequences, not LLM conversation content.

---

## S6 Recommendations for 8.7.1 Architect

### R-1 Adopt Claude Code 4-scope file structure verbatim
System / user / project / local -- same mental model Claude Code users already know.
Reduces onboarding friction for community (user brief S1.7: tuong tu nhu claude code).
Source: code.claude.com/docs/en/settings

### R-2 Array-concat merge + scalar last-wins
Array keys (deny_paths, allowed_tools, hook_events): concatenate + deduplicate across scopes.
Scalar keys (model, effort_level, max_sessions): most-specific scope wins.
Prevents user-scope allowlist silently overriding project-scope denylist.
Source: Claude Code official settings -- array merge behavior section.

### R-3 Zod schema validation for all four config files
Parse at daemon startup. Process.exit on system/project failure.
Log warning + use defaults on user/local parse failure.
Source: claudegram src/config.ts:13-232 (research/claudegram.md:BORROW-5).

### R-4 Hooks inherit per-scope; system hooks are not overridable
User-scope hooks apply to all projects. Project-scope hooks apply to that project.
Local-scope hooks run personally. System hooks cannot be disabled by lower scopes.
Source: code.claude.com/docs/en/hooks -- hook resolution order table.

### R-5 Opt-in upstream telemetry, user-scope only, OTLP/JSON wire
upstream_sync: true in ~/.orch/settings.yaml enables anonymized span forwarding.
Must not be in project-scope config (prevents accidental commits).
Reuses existing otel-tracing pipeline -- zero new wire format code.
Source: user brief S1.7 + orch otel-tracing SKILL + claude-code-learn.md usage fields.

### R-6 Add profile.local.yaml; gitignore it by default
Add .orch/profile.local.yaml to .gitignore template from orch attach / orch init.
Mirrors .claude/settings.local.json pattern.
Existing orch .gitignore already excludes .claude/settings.local.json -- extend the rule.
Source: Claude Code official settings (local scope = gitignored).

### R-7 Memory files follow same 3-tier scope
~/.orch/ORCH_CONTEXT.md (user-global) / <project>/.orch/CONTEXT.md (committed) /
<project>/.orch/CONTEXT.local.md (gitignored).
Mirrors Claude Code CLAUDE.md / CLAUDE.local.md tiering.
Source: Claude Code official settings -- memory files table.

### R-8 Ship OSS housekeeping minimum with v2.3
CONTRIBUTING.md + CODE_OF_CONDUCT.md (Contributor Covenant 2.1) + SECURITY.md +
.github/ISSUE_TEMPLATE/* + .github/pull_request_template.md.
MIT license already present; keep it.
Source: S3 gap analysis; GitHub community health file standards.

### R-9 Amend README and CHARTER to domain-workflow positioning
README.md: replace orchestration daemon framing with autonomous coding workflow expert.
PROJECT_CHARTER.md S Vision: add domain-workflow positioning statement.
CONTRIBUTING.md: contributors contribute workflow patterns, not just code.
Source: S5 prior art gap; user brief S1.7.

### R-10 Telemetry event schema: workflow events only, no content
Upstream schema: { task_type, outcome, tokens_input, tokens_output, retry_count, phase, substage }.
Redact all free-text (prompts, file names, project names). Hash session IDs.
Source: user brief S1.7 data collection intent + claude-code-learn.md message.usage.* structure.

---

*End of phase-8-oss-config-patterns.md -- 7 sources, 5 borrow, 3 reject, 10 recommendations, MIT confirmed.*