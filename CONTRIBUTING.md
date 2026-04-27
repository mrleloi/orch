# Contributing to Orch

Orch is a personal-first tool. Contributions are welcome, but the scope is bounded by
[PROJECT_CHARTER.md](PROJECT_CHARTER.md) — please read it before opening a PR.

---

## Before you contribute

1. **Read the charter.** [PROJECT_CHARTER.md](PROJECT_CHARTER.md) is immutable v1.0. The
   vision, principles, and anti-requirements there govern all contributions. If your idea
   conflicts with the charter, open a Discussion first — do not send a PR.

2. **Read the constitution.** `agent-workspace/constitution/` holds the normative docs for
   architecture, invariants, and coding principles. Key files:
   - `architecture.md` — module boundaries, adapter pattern, no cross-feature imports
   - `invariants.md` — I-1 through I-15; violations block merge
   - `coding-principles.md` — TypeScript strict, no `any`, error handling

3. **Open an issue before non-trivial PRs.** For bugs, a brief issue is enough. For new
   features or design changes, open an issue or Discussion first so scope can be agreed
   before code is written. Unsolicited large PRs that conflict with charter scope will be
   declined.

---

## Setup

Requirements:

- Node.js 20 or 22
- pnpm 9+
- Git

```bash
git clone https://github.com/<OWNER>/<REPO>.git
cd <REPO>
pnpm install
pnpm test          # all 1470+ cases should pass
pnpm typecheck     # zero errors expected
pnpm lint          # zero warnings expected
```

If any of those three gates fail on a clean clone, open an issue — that is a bug.

See `agent-workspace/constitution/coding-principles.md` for TypeScript style rules. In
particular: `strict` mode is on, `noImplicitAny` is on, and `any` types in
`packages/core/` are a hard block on merge.

---

## Workflow

### Fork, branch, PR

```bash
git checkout -b fix/your-topic-here
# make changes
git add <files>
git commit -s -m "fix: short description of what and why

Signed-off-by: Your Name <your@email.com>"
git push origin fix/your-topic-here
# open PR against main
```

The `-s` flag on `git commit` appends the `Signed-off-by:` line automatically.

### DCO sign-off required (replaces patent grant — see Decision 030)

Every commit must include a `Signed-off-by:` trailer:

```
Signed-off-by: Your Full Name <your@email.com>
```

This is the [Developer Certificate of Origin](https://developercertificate.org/) (DCO),
the same convention used by the Linux kernel. It certifies that:

- The contribution is your original work, or
- The contribution is based on prior open-source work you have the right to submit, and
- You understand the contribution will be part of a public open-source project.

Orch uses MIT (no patent-grant clause). DCO sign-off is the documented mitigation for
patent-assertion risk at orch's scale. PRs without DCO sign-off on every commit will be
asked to rebase before merge. See [Decision 030](agent-workspace/memory/decisions/030-license-mit.md)
for the full rationale.

### Tests

New code requires tests. The target ratio is 1:1 (one test case per logical branch of new
code) where practical. If you add a module, add a spec file alongside it. The existing
test suite in `packages/core/src/` is the style reference.

Run the test suite before pushing:

```bash
pnpm test                       # full workspace
pnpm --filter @orch/core test   # core only (faster for core changes)
pnpm test:hooks                 # hooks suite (bash + vitest)
```

### Pre-commit hooks

Husky pre-commit hooks run `pnpm lint` and `pnpm typecheck` on staged files. They must
pass. Do not use `--no-verify` to skip them; fix the underlying issue instead.

---

## Code review

Reviewers focus on:

1. **Charter coherence** — does the change stay within "schedule, spawn, monitor, notify,
   hand off" scope? (Charter Principle 2)
2. **Invariant compliance** — does it pass the invariant checklist in
   `agent-workspace/constitution/invariants.md`?
3. **Simplicity** — is this the minimum code that solves the problem? (Karpathy P2)
4. **Surgical change** — does every changed line trace to the task? (Karpathy P3)

Adversarial review (sandwich-verifier pattern) may apply for changes touching the state
machine, queue, or session controller.

---

## Releases

Orch uses [Semantic Versioning](https://semver.org/):

| Bump | When |
|---|---|
| Major (2.0, 3.0) | Charter amendment (requires written rationale) |
| Minor (1.1, 1.2) | New spec approved, new feature module, non-breaking contract change |
| Patch (1.0.1) | Bug fixes, doc improvements, dependency bumps |

The release process is documented in `docs/release.md`. Contributors do not trigger
releases — the project owner does after reviewing merged PRs.

---

## Out-of-scope contributions

These are gentle redirects, not rejections of you as a contributor. They reflect the
charter's explicit anti-requirements ([PROJECT_CHARTER.md §"What This Is Not"](PROJECT_CHARTER.md)):

- **SaaS or hosted features** — Orch is single-user, self-hosted by design. Cloud
  deployment, multi-tenant auth, and hosted queue services are out of scope.
- **Generic agent framework expansion** — Orch is not an agent-to-agent protocol, not a
  swarm coordinator, not a DAG engine. Those belong in the Claude Code session layer.
- **Non-coding domain features** — Marketing dashboards, accounting integrations, and
  similar features are deferred to the domain-workflow ontology (v2.4+).
- **Replacing the Claude CLI subprocess** — Orch spawns `claude` via `ccs`. Using the
  Agent SDK programmatic API for subscription accounts is a ToS violation (Anthropic,
  April 2026). PRs that introduce `@anthropic-ai/sdk` chat-sending for subscription use
  will be declined.
- **Hardcoded project names** — `packages/core/` must remain project-agnostic. PRs that
  reference specific project names (e.g., "stockforge") in core will be asked to
  generalize via `profile.yaml` config.

If you are unsure whether your idea is in scope, open a Discussion before writing code.

---

## Contact

- **Bugs and features**: [GitHub Issues](https://github.com/<OWNER>/<REPO>/issues)
- **Questions and ideas**: [GitHub Discussions](https://github.com/<OWNER>/<REPO>/discussions)
- **Security vulnerabilities**: see [SECURITY.md](SECURITY.md) — do not use public issues for security reports

Replace `<OWNER>/<REPO>` with the actual repository slug once published.
