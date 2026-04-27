#!/usr/bin/env bash
# demo.sh — Multi-user tenancy isolation demo
#
# Demonstrates 2 users (alice + bob) each owning a personal project + sharing 1 project.
# Uses tsx to import ScopeResolver directly from TypeScript source (no build step needed).
#
# Usage:
#   bash examples/multi-user/demo.sh
#
# Exit 0 if all assertions pass; exit 1 if any fail.
# .scratch/ is preserved on failure for post-mortem debugging.
#
# Runtime strategy: tsx (v4+) is used as the loader so ScopeResolver.ts can be
# imported directly without a pnpm build step. tsx is available as a devDependency
# in packages/core and at the root workspace level.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# ── Step 1: Create scratch directory ─────────────────────────────────────────
SCRATCH_DIR="${SCRIPT_DIR}/.scratch"
echo "==> [1/5] Creating scratch workspace at ${SCRATCH_DIR}"
rm -rf "${SCRATCH_DIR}"
mkdir -p "${SCRATCH_DIR}"

# ── Step 2: Build 4-tier directory structure ──────────────────────────────────
echo "==> [2/5] Building workspace directories"

# Alice's personal project
mkdir -p "${SCRATCH_DIR}/agent-workspace/alice/projects/personal"

# Bob's personal project
mkdir -p "${SCRATCH_DIR}/agent-workspace/bob/projects/personal"

# Shared project (both alice + bob participate)
mkdir -p "${SCRATCH_DIR}/agent-workspace/shared-projects/proj-x"

# ── Step 3: Write sentinel files ──────────────────────────────────────────────
echo "==> [3/5] Writing sentinel files"

printf "Alice's personal secret — bob must not see this.\n" \
  > "${SCRATCH_DIR}/agent-workspace/alice/projects/personal/A_SECRET.txt"

printf "Bob's personal secret — alice must not see this.\n" \
  > "${SCRATCH_DIR}/agent-workspace/bob/projects/personal/B_SECRET.txt"

printf "Shared project content — both alice and bob may read this.\n" \
  > "${SCRATCH_DIR}/agent-workspace/shared-projects/proj-x/SHARED.txt"

# ── Step 4: Run Node assertion script via tsx ─────────────────────────────────
echo "==> [4/5] Running isolation assertions (tsx)"

# Locate tsx: prefer root workspace, fall back to @orch/core devDep
TSX_BIN="${REPO_ROOT}/node_modules/.bin/tsx"
if [ ! -f "${TSX_BIN}" ]; then
  TSX_BIN="${REPO_ROOT}/packages/core/node_modules/.bin/tsx"
fi
if [ ! -f "${TSX_BIN}" ]; then
  echo "ERROR: tsx not found. Run 'pnpm install' first." >&2
  exit 1
fi

ASSERTION_EXIT=0
SCRATCH_DIR="${SCRATCH_DIR}" "${TSX_BIN}" "${SCRIPT_DIR}/check-isolation.mjs" || ASSERTION_EXIT=$?

if [ "${ASSERTION_EXIT}" -ne 0 ]; then
  echo ""
  echo "==> FAIL: One or more assertions failed. Scratch dir preserved at:"
  echo "    ${SCRATCH_DIR}"
  exit "${ASSERTION_EXIT}"
fi

# Scenario 2 (shared project, personal token / rate-limit failover) is deferred to
# substage 8.7 — requires live ccs profile isolation + OTEL trace tag verification
# which is out of scope for the file-level tenancy demo. See tenancy-model.md §6.2.

# ── Step 5: Cleanup scratch on success ───────────────────────────────────────
echo "==> [5/5] Cleaning up scratch directory"
rm -rf "${SCRATCH_DIR}"

echo ""
echo "==> PASS: All multi-user tenancy assertions passed."
exit 0
