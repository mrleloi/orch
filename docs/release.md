# Release Process

> How to cut a release, maintain the changelog, and apply semver rules for Orch.

---

## Table of Contents

1. [How to Cut a Release](#how-to-cut-a-release)
2. [CHANGELOG Format](#changelog-format)
3. [Semver Rules](#semver-rules)
4. [Breaking Change Policy](#breaking-change-policy)
5. [Pre-Release Checklist](#pre-release-checklist)
6. [Post-Release Checklist](#post-release-checklist)

---

## How to Cut a Release

The release pipeline is defined in [`.github/workflows/release.yml`](../.github/workflows/release.yml).
Pushing a `v*` tag triggers: install → build → `pnpm publish -r` → GitHub Release.

Follow these steps in order:

### 1. Bump versions

Bump the version in the root `package.json` and in each workspace package that
changed. Use `pnpm version` inside each package directory:

```bash
# From the repo root — bump all workspace packages to the same version:
pnpm -r exec -- pnpm version 1.2.3 --no-git-tag-version

# Or bump only packages that changed (preferred for independent releases):
cd packages/core
pnpm version 1.2.3 --no-git-tag-version

cd ../cli
pnpm version 1.2.3 --no-git-tag-version
```

`--no-git-tag-version` prevents pnpm from creating per-package tags. The single
repo-level tag (step 4) is the authoritative release marker.

### 2. Update CHANGELOG.md

Add a new release section at the top of `CHANGELOG.md` following the
[Keep a Changelog](https://keepachangelog.com/) format. See the
[CHANGELOG Format](#changelog-format) section below.

### 3. Commit

```bash
git add packages/*/package.json package.json CHANGELOG.md
git commit -m "chore(release): vX.Y.Z"
```

### 4. Tag

```bash
git tag vX.Y.Z
```

Tags are annotated when the release includes a migration guide:

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z — see CHANGELOG for migration notes"
```

### 5. Push tag

```bash
git push origin main vX.Y.Z
```

Pushing the tag fires the `release.yml` workflow. Do not push the tag before the
commit is on `main` — the workflow checks out the tag's commit.

### 6. Verify CI

Watch the Actions run at `https://github.com/<owner>/orch/actions`. Confirm:

- All three steps pass: **Build**, **Publish**, **Create GitHub Release**.
- Each published package appears in your npm organization (or user scope).
- The GitHub Release was created and `generate_release_notes` populated the body.

If the publish step fails with an npm auth error, verify that the `NPM_TOKEN`
secret is set in the repository settings and has publish access to the scope.

---

## CHANGELOG Format

Orch follows [Keep a Changelog](https://keepachangelog.com/) (v1.1.0).

```markdown
# Changelog

All notable changes to this project will be documented in this file.
Format: https://keepachangelog.com/en/1.1.0/

## [Unreleased]

## [1.2.3] — 2026-05-01

### Added
- `handoff` module builds git-diff summary for successor sessions (#42).

### Changed
- `ORCH_HTTP_PORT` default changed from 3737 to 4141 (BREAKING — see migration below).

### Fixed
- SQLite WAL mode not applied on first boot (#39).

### Deprecated
- `profile.yaml` field `sessionType` replaced by `sessionTypes` (array). Old form
  still accepted with a warning; will be removed in v2.0.

### Removed
- Nothing removed this release.

### Security
- Hook endpoint now rejects requests missing `X-Orch-Hook-Secret` with 401, not 500.

[1.2.3]: https://github.com/<owner>/orch/compare/v1.2.2...v1.2.3
[Unreleased]: https://github.com/<owner>/orch/compare/v1.2.3...HEAD
```

Rules:
- Keep an `[Unreleased]` section at the top. Entries accumulate there during
  development and are moved into a versioned section at release time.
- Every entry cites the PR number or commit SHA.
- Breaking changes appear under `Changed` with a `(BREAKING)` prefix and a link
  to the migration guide.
- Security fixes are always documented regardless of patch significance.

---

## Semver Rules

Orch uses [Semantic Versioning 2.0.0](https://semver.org/).

| Version part | When to increment |
|---|---|
| **MAJOR** (`X.0.0`) | Breaking changes (see list below). |
| **MINOR** (`x.Y.0`) | New features, new optional configuration, new REST endpoints. Backward-compatible. |
| **PATCH** (`x.y.Z`) | Bug fixes, documentation-only changes, dependency bumps that do not alter behavior. |

### Breaking change triggers (MAJOR bump required)

- Removing or renaming a CLI command (`orch init`, `orch start`, `orch stop`).
- Removing or renaming a `profile.yaml` field that was not previously deprecated.
- Removing or renaming a REST endpoint used by external clients.
- Changing the hook payload schema in a way that removes fields or alters types.
- Changing the default port (`ORCH_HTTP_PORT`) or any env-var name.
- Changing the `IAgentRuntime` interface in a backward-incompatible way.

### Pre-release versions

During active development before v1.0, use the `1.0.0-alpha.N` scheme. Alpha
versions may break without a MAJOR bump. Once v1.0.0 is tagged, the semver
contract above is binding.

---

## Breaking Change Policy

### Deprecation lifecycle

1. A feature to be removed is deprecated in the current MINOR release with a
   console warning at startup (e.g., deprecated profile.yaml field still works but
   logs `[DEPRECATED]`).
2. The next MINOR release adds a migration guide to `CHANGELOG.md`.
3. The following MAJOR release removes the feature.

Minimum lifecycle: **one full MINOR release** with the deprecation warning visible
before removal. No silent removals.

### Migration guides

Every MAJOR release ships a migration guide. Publish it in `CHANGELOG.md` under
the relevant version, and link from the GitHub Release notes. The guide must cover:

- What changed and why.
- Step-by-step upgrade instructions (config changes, command renames, schema diffs).
- Any automated migration tooling (if provided).

### ToS-impacting changes

Anthropic ToS evolution may require behavioral changes to how Orch invokes the
`claude` CLI or uses `ccs` accounts. Per Charter reference R-2026-04 (subscription
account CLI-only rule):

- **6-month notice** minimum before any change that alters how existing users'
  subscription accounts are used.
- A `SECURITY` CHANGELOG entry accompanies any ToS-compliance change.
- If a breaking ToS change is discovered after release, issue a patch immediately
  and communicate via GitHub Release notes and (if applicable) the Telegram
  announcement channel.

---

## Pre-Release Checklist

Verify all items before pushing the version tag.

- [ ] **Tests pass**: `pnpm test` exits 0 (all workspaces).
- [ ] **Typecheck clean**: `pnpm typecheck` exits 0 (no TS errors).
- [ ] **Lint clean**: `pnpm lint` exits 0 (no ESLint errors or warnings).
- [ ] **CHANGELOG updated**: the new version section exists under `[Unreleased]`
      moved to `[X.Y.Z] — YYYY-MM-DD`. `[Unreleased]` section is empty or
      regenerated.
- [ ] **Version bumped**: root `package.json` and all changed workspace
      `package.json` files reflect the new version.
- [ ] **Examples still parse**: `examples/` profile files validate against the
      current `ProfileSchema` (run `pnpm -C packages/core exec ts-node -e
      "import('./src/domain/profile.js').then(m => console.log('ok'))"` or
      equivalent schema smoke-test).
- [ ] **README links resolve**: click through links in `README.md` to confirm
      `docs/` pages and external URLs are reachable.
- [ ] **No placeholder content**: `grep -r "Phase 4 Task" docs/` returns 0 hits.
- [ ] **Breaking changes documented**: if MAJOR, migration guide is written and
      linked.

---

## Post-Release Checklist

After the CI workflow completes:

- [ ] **GitHub Release finalized**: open the auto-generated release on GitHub,
      review the body, add migration guide link if MAJOR.
- [ ] **npm publish confirmed**: verify each workspace package appears at the
      correct version on `https://registry.npmjs.org/@orch/<package>`.
- [ ] **README badge updated** (if version-specific badge used in README).
- [ ] **Telegram announcement** (if a user-base channel exists): post the
      release version, one-line summary, and link to GitHub Release notes.
- [ ] **`[Unreleased]` section reset** in `CHANGELOG.md` for the next development
      cycle (if not done pre-release).

---

## Cross-References

- **Configuration** (env vars, profile schema): [`docs/configuration.md`](configuration.md)
- **Architecture** (module map, adapter pattern): [`docs/architecture.md`](architecture.md)
- **Troubleshooting** (common operator failures): [`docs/TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
- **CI workflow**: [`.github/workflows/release.yml`](../.github/workflows/release.yml)
- **Changelog**: [`CHANGELOG.md`](../CHANGELOG.md)
