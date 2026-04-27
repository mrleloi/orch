#!/usr/bin/env bash
# v2.3-tenancy-rehome.sh — Opt-in: rehome flat agent-workspace/ to multi-user layout.
# Default: dry-run. Use --apply to move files.
#
# Usage: bash scripts/migration/v2.3-tenancy-rehome.sh [--apply] [--user NAME] [--project SLUG]
# Flags: --apply | --rollback | --user <name> | --project <slug> | --help

set -euo pipefail

APPLY=false; ROLLBACK=false; USER_ID="default-user"; PROJECT_SLUG=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORKSPACE="${REPO_ROOT}/agent-workspace"
BACKUP_DIR="${REPO_ROOT}/agent-workspace.pre-v2.3.bak"
MIGRATE_DIRS=(memory session-plans traces research ontology constitution)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)    APPLY=true; shift ;;
    --rollback) ROLLBACK=true; shift ;;
    --user)     USER_ID="$2"; shift 2 ;;
    --project)  PROJECT_SLUG="$2"; shift 2 ;;
    --help|-h)  sed -n '2,4p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown: $1. Use --help." >&2; exit 1 ;;
  esac
done

# ── Rollback ──────────────────────────────────────────────────────────────────
if [ "${ROLLBACK}" = true ]; then
  [ -d "${BACKUP_DIR}" ] || { echo "ERROR: No backup at ${BACKUP_DIR}" >&2; exit 1; }
  echo "Rollback: ${BACKUP_DIR} → ${WORKSPACE}"
  if [ "${APPLY}" = true ]; then
    rm -rf "${WORKSPACE}" && cp -r "${BACKUP_DIR}" "${WORKSPACE}"
    echo "Rollback applied."
  else
    echo "DRY-RUN: pass --apply to restore."
  fi
  exit 0
fi

# ── Infer project slug ────────────────────────────────────────────────────────
if [ -z "${PROJECT_SLUG}" ]; then
  GIT_REMOTE=$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || echo "")
  [ -n "${GIT_REMOTE}" ] && PROJECT_SLUG=$(basename "${GIT_REMOTE}" .git | tr '[:upper:]' '[:lower:]' | tr ' _' '-')
  [ -z "${PROJECT_SLUG}" ] && PROJECT_SLUG=$(basename "${REPO_ROOT}" | tr '[:upper:]' '[:lower:]' | tr ' _' '-')
fi

DEST_ROOT="${WORKSPACE}/${USER_ID}/projects/${PROJECT_SLUG}"

[ -d "${WORKSPACE}" ] || { echo "ERROR: agent-workspace/ not found" >&2; exit 1; }

# Idempotency check
if [ -d "${DEST_ROOT}" ] && [ "$(ls -A "${DEST_ROOT}" 2>/dev/null)" ]; then
  echo "INFO: Migration already complete at ${DEST_ROOT}. No action."; exit 0
fi

# ── Migration plan ────────────────────────────────────────────────────────────
echo ""
echo "v2.3 Tenancy Rehome — Migration Plan"
echo "  Source:      ${WORKSPACE}/"
echo "  Destination: ${DEST_ROOT}/"
echo "  Backup:      ${BACKUP_DIR}/"
echo ""
echo "Directories to migrate:"
FOUND_ANY=false
for dir in "${MIGRATE_DIRS[@]}"; do
  if [ -d "${WORKSPACE}/${dir}" ]; then
    SIZE=$(du -sh "${WORKSPACE}/${dir}" 2>/dev/null | cut -f1 || echo "?")
    echo "  ${dir}/  (${SIZE})"
    FOUND_ANY=true
  fi
done
if [ "${FOUND_ANY}" = false ]; then
  echo "  (none found — workspace may already be migrated)"; echo ""; exit 0
fi
echo ""

if [ "${APPLY}" != true ]; then
  echo "DRY-RUN. No files modified. Run with --apply to migrate."
  echo "  bash scripts/migration/v2.3-tenancy-rehome.sh --apply --user ${USER_ID} --project ${PROJECT_SLUG}"
  exit 0
fi

# ── Apply ─────────────────────────────────────────────────────────────────────
echo "Applying migration..."
[ -d "${BACKUP_DIR}" ] || cp -r "${WORKSPACE}" "${BACKUP_DIR}"
mkdir -p "${DEST_ROOT}"
for dir in "${MIGRATE_DIRS[@]}"; do
  [ -d "${WORKSPACE}/${dir}" ] && mv "${WORKSPACE}/${dir}" "${DEST_ROOT}/${dir}" && echo "  Moved ${dir}/"
done
echo ""
echo "Migration complete → ${DEST_ROOT}/"
echo "Set ORCH_USER_ID=${USER_ID} in your environment."
echo "When verified: rm -rf ${BACKUP_DIR}"
exit 0
