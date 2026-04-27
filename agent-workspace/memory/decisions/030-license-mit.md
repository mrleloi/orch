---
id: 030
title: LICENSE — MIT
status: ratified
date: 2026-04-27
phase: 8 (substage 8.0.3)
authoring_agent: master-planner (opus 4.7, /effort max, ORCH_SPAWNED, session #40)
authority: master plan §10 D-D + research output 8.0.2 §S3 (license survey)
addresses_questions: []
---

# Decision 030 — LICENSE: MIT

## Context

Phase 8 Dimension 7 (user brief §1.7, "khung quản lý cho cộng đồng / open source / NPM") names community OSS-readiness as a v2.3 deliverable. SC-46 (master plan §1, line 32) requires `LICENSE` present and decided in 8.0; CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, .github/ISSUE_TEMPLATE/ exist; `npm pack --dry-run` passes.

Research output 8.0.2 §S3 (lines 80-97) surveyed 5 personal-tool OSS reference repos (claudegram, claude-to-im, praktor, nanoclaw, claudekit-skills); ALL 5 use **MIT**. None use Apache-2.0 or any other license. Research line 93-96 directly recommends MIT and notes "already declared in orch LICENSE" — meaning the file already exists in the repo from initial scaffold; this decision formalizes keeping it as MIT rather than switching.

Master plan §10 D-D (line 270) pre-bound MIT as the default. The decision must:
- Ratify MIT.
- Document the rejection of Apache-2.0 with reasoning.
- Acknowledge the patent-grant gap MIT carries vs Apache-2.0 and document the mitigation (CONTRIBUTING.md DCO sign-off).
- Specify the year + copyright holder placeholder format for the LICENSE file.

## Options considered

### Option A — MIT

Pros:
- Zero ecosystem friction. NPM ecosystem norm; community recognizes MIT immediately (research 8.0.2 line 95-96 "well-understood by Claude Code users, zero contribution friction").
- Maximally permissive. Forks, derivative works, commercial use all unrestricted. Aligns with charter §"Craft Philosophy" "Reusability as explicit design constraint" (line 42).
- All 5 surveyed reference repos use MIT (research 8.0.2 line 81-86) — stays aligned with the cluster of comparable projects; no rationale-required justification for community contributors.
- Already in repo. Switching to anything else is a relicensing event requiring contributor consent if the repo had external contributors (not yet, but adding overhead later is harder).
- Short license text (~21 lines including copyright header) — low cognitive load for new contributors reading the file.

Cons:
- No explicit patent grant. Apache-2.0 includes a patent-grant clause; MIT is silent. If a contributor adds patentable IP to orch and later asserts patent rights against users, MIT does not protect the project (Apache-2.0 would). Mitigation: CONTRIBUTING.md DCO sign-off (see Consequences §3).
- No NOTICE file mechanism. Apache-2.0 lets you require a NOTICE be retained in derivatives; MIT does not. Not a charter constraint.
- No explicit trademark provision. MIT is silent; Apache-2.0 has Section 6 (no trademark license). Orch is not a trademarked name; non-issue.

ACCEPTED. Master plan default; aligns with all surveyed reference repos; charter-coherent.

### Option B — Apache-2.0

Pros:
- Explicit patent grant (Section 3) — patent-rights protection if a contributor later asserts patents. The single feature MIT lacks.
- NOTICE file mechanism for attribution preservation in derivatives.
- Explicit trademark non-license (Section 6).
- More common in enterprise / Fortune 500 stack (Kubernetes, Apache projects, AWS SDKs).

Cons:
- Longer license text (~200 lines vs MIT's ~21). Higher cognitive load for casual contributors.
- Apache-2.0 is GPL-incompatible in some configurations; could complicate downstream integration with GPL'd plugins (though orch itself is not GPL territory).
- Heavier requirement on derivatives: must preserve NOTICE file, must apply Apache-2.0 license to modifications, must state changes. For a personal tool community-fork pattern, this is friction.
- ZERO of the 5 surveyed reference repos (research 8.0.2 line 81-86) use Apache-2.0. Picking it would deviate from the cluster norm with no offsetting benefit.
- Patent-grant mitigation already available via Developer Certificate of Origin (DCO) sign-off in CONTRIBUTING.md (8.7.4 task; cheap).

REJECTED. Apache-2.0's patent grant is its only meaningful advantage; DCO sign-off mitigates the gap. The added text-length and ecosystem-deviation are not offset by the patent benefit at orch's scale.

### Option C — Dual-license MIT + Apache-2.0 (recipient choice)

Pros:
- Captures both audiences. Recipient can pick MIT for permissive use OR Apache-2.0 for patent grant.
- Used by some Rust-ecosystem projects (e.g., serde) as a community standard.

Cons:
- Adds two LICENSE files (LICENSE-MIT + LICENSE-APACHE) and a top-level `## License` README section explaining the choice — additional documentation surface that 8.7.4 must author.
- All 5 surveyed reference repos use single MIT (research 8.0.2 line 81-86); dual-license is over-engineering for the orch scope.
- Karpathy P2 (Simplicity First): two licenses is more than one license; pick the simplest that solves the problem.

REJECTED. Complexity not offset by benefit. If patent protection becomes a real concern post-v2.3, switching from MIT to dual-license is a future option (relicensing with contributor consent — likely small contributor pool, low friction at v2.3 timeframe).

## Choice

**Option A — MIT.** Keep the existing `LICENSE` file as MIT. Year + copyright holder format = `Copyright (c) 2026 Frank Le and orch contributors`.

### Year + copyright holder placeholder format

```
Copyright (c) 2026 Frank Le and orch contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Rules:
1. Year is the year of first publication (`2026` for v2.3; year stays `2026` even when copyright is updated; convention is single-year for first publication, range `2026-YYYY` only if substantial new copyrightable additions are made in subsequent years).
2. Copyright holder = primary owner + "and orch contributors" — captures community PRs without naming each contributor (alternative would be a separate AUTHORS file; simpler to fold into the LICENSE line).
3. Holder name: `Frank Le` (project owner per `git config user.name`); capitalized; no email in the LICENSE file (email lives in `package.json` and CONTRIBUTING.md).

### Patent-grant note (acknowledge MIT does NOT grant patent rights)

MIT Section 1 grants copyright permission only — no patent rights. If a contributor adds patentable IP to orch and subsequently asserts patent claims, MIT provides no defense.

Mitigation: **CONTRIBUTING.md requires Developer Certificate of Origin (DCO) sign-off**. Each commit message must include `Signed-off-by: Name <email>` (the standard `git commit -s` flag). The DCO (Linux kernel convention) is a contributor's certification that:
- The contribution is their original work, OR
- The contribution is based on previous open-source work which they have rights to submit, AND
- They understand the contribution will be public.

DCO sign-off does not grant patent rights, but it establishes contributor intent — if a contributor later attempts to assert patent claims against the project, the DCO sign-off is documentary evidence of bad-faith submission.

For a personal-tool with ≤10 contributors at v2.3 scale, DCO sign-off is sufficient mitigation. If contributor-base grows or commercial vendors begin contributing, the v3.0 review reconsiders Apache-2.0 relicensing (see Consequences §6).

### Why MIT over Apache-2.0 (cite 8.0.2 §3 + §6 reasoning)

Research output 8.0.2 §S3 (lines 80-97) and §S6 R-1 (lines 173-174) together argue:

1. **Cluster norm** (line 81-86): 5/5 surveyed personal-tool reference repos use MIT. None use Apache-2.0. Picking Apache-2.0 means orch is the outlier in its category.
2. **Community fork-friendliness** (line 95-96): "MIT is maximally permissive, well-understood by Claude Code users, zero contribution friction". Apache-2.0's NOTICE-preservation requirement adds friction for forks.
3. **Personal-tool scope** (line 96): "Apache-2.0 adds patent clause complexity with no benefit for a personal tool without patents". Orch has no patents to assign and no patent-asserting contributors expected.
4. **NPM ecosystem alignment** (general npm convention): the npm registry's most-downloaded packages skew heavily MIT; ISC second; Apache-2.0 is more common in JVM/Go ecosystems than Node.

8.0.2 §S6 R-8 (line 209-213) ratifies the recommendation: "Ship OSS housekeeping minimum with v2.3 ... MIT license already present; keep it."

## Why (Charter rules + Karpathy + Master plan §10)

- **Charter §"Craft Philosophy"** (line 42): "Reusability as explicit design constraint, never an afterthought" → maximally permissive license is the lowest-friction reusability path.
- **Charter Principle 8** (line 67): "Reusable without forking" → MIT lets users fork-and-modify with zero friction; Apache-2.0 adds NOTICE-preservation friction.
- **Charter §"Stakeholders"** (lines 124-128): "Future team (3-5 peers): read-only on roadmap, consumers of the npm packages" — small contributor pool, low patent-assertion risk; MIT's patent-grant gap is acceptable.
- **Karpathy P2 (Simplicity First)**: shortest license text that solves the problem; one LICENSE file vs Option C's two.
- **Master plan §10 D-D** (line 270-271): pre-bound default = MIT; "Apache-2.0 alternative available if 8.7.1 architect surfaces patent-grant rationale" — research 8.0.2 surfaced no such rationale; default ratifies.
- **Research output 8.0.2 §S3 line 81-86**: 5/5 reference repos use MIT; cluster norm.
- **Research output 8.0.2 §S3 line 93-96**: explicit MIT recommendation rationale (permissive, well-understood, zero friction, patents N/A).
- **Research output 8.0.2 §S6 R-8 line 213**: "MIT license already present; keep it."

## Consequences (binding)

1. **`LICENSE` file at repo root** uses the MIT text above with the `Copyright (c) 2026 Frank Le and orch contributors` header. 8.7.4 task verifies/updates the file.
2. **`package.json` `license` field** = `"MIT"` (SPDX identifier; uppercase as per SPDX convention). 8.7.4 task verifies.
3. **`CONTRIBUTING.md` DCO sign-off requirement**: every commit must include `Signed-off-by:` line; PRs without DCO are rejected. 8.7.4 task authors `CONTRIBUTING.md` with DCO section.
4. **`.github/PULL_REQUEST_TEMPLATE.md` checklist** includes DCO sign-off check. 8.7.4 task authors PR template.
5. **`README.md` License section** points to `LICENSE` file with one-line summary `Released under the MIT License — see [LICENSE](./LICENSE).` — no expanded text. 8.7.4 task adds to README.
6. **Relicensing path documented**: if v3.0 review (when contributor pool > 10 OR commercial vendor contributions begin) decides Apache-2.0 is needed for patent protection, relicensing requires:
   - All non-trivial contributors' written consent (CLA-style).
   - Public-discussion period (≥30 days on GitHub Discussions).
   - Migration commit referencing this Decision 030 as the prior position.
   - Until v3.0 review, MIT is binding.
7. **No NOTICE file required** (MIT does not define one). 8.7.4 task does NOT create a NOTICE file.
8. **No patent-license file required**. DCO sign-off in CONTRIBUTING.md is the documented mitigation; this is not equivalent to Apache-2.0's Section 3 grant but is acceptable at orch's scale per research output 8.0.2 line 96.
9. **SPDX header in source files NOT required** at v2.3 — adds review burden for marginal benefit. v3.0 review may reconsider if community asks. 8.7.4 task does NOT add SPDX headers to source files.
10. **License compatibility with dependencies**: MIT is compatible with all permissive licenses (BSD, ISC, Apache-2.0, MIT-0, Unlicense). Existing dependencies in `package.json` are surveyed by 8.7.5 npm prep; any GPL/AGPL/LGPL-only dep that surfaces is escalated as a v2.3 blocker (none expected).

## Cross-references

- Master plan §10 D-D (line 270-271)
- Master plan §1 SC-46 (line 32), §3 substage 8.7 (lines 146-156), §11 effort matrix (lines 308-312)
- Research output `agent-workspace/research/phase-8-oss-config-patterns.md` §S3 (lines 80-97), §S6 R-8 (lines 209-213), R-1 (lines 173-174)
- Decision 027 (Phase 8 strategic redirect — DIM 7 community-OSS mandate)
- Decision 028 (config-style normative format — applies to OSS-housekeeping markdown files like CONTRIBUTING.md)
- Charter §"Craft Philosophy" (lines 39-47)
- Charter Principle 8 (line 67)
- Charter §"Stakeholders" (lines 124-128)
- Karpathy P2 (CLAUDE.md Core Principles)

**END Decision 030.**
