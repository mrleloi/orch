#!/usr/bin/env bash
# substage-parallelism-flag.sh — flag substages claiming parallel-safe with file-edit collisions.
# Spec: task-partition-matrix.md §7 T-047 (per-substage gate). G.7 closure.
#
# 2-pass state machine (fix CF-V2.5-9.7-PARALLELISM-FLAG):
#   Pass 1: Scan routing brief; build:
#     SUBSTAGE_PARALLEL[N.M] = "[N.X, N.Y, ...]"   (from parallel_safe_with: [...])
#     SUBSTAGE_OUTPUT[N.M]   = "file1\nfile2\n..."  (from output_files (write): [...])
#   Pass 2: For each substage with parallel peers, for each pair, check if their
#            output_files lists share any file path. Emit [FAIL] on collision.
#
# Exit:
#   0 = PASS  — all pairs checked, no collisions
#   1 = FAIL  — at least one file-edit collision detected between parallel substages
#   2 = SKIP  — routing brief absent, or bash < 4, or no parallel_safe_with entries parsed

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Support phase-10 routing brief (current); fall back to phase-9 if absent
ROUTING_BRIEF_10="${PROJECT_DIR}/agent-workspace/memory/phase-10-routing-brief.md"
ROUTING_BRIEF_9="${PROJECT_DIR}/agent-workspace/memory/phase-9-routing-brief.md"

if [[ -f "$ROUTING_BRIEF_10" ]]; then
  ROUTING_BRIEF="$ROUTING_BRIEF_10"
elif [[ -f "$ROUTING_BRIEF_9" ]]; then
  ROUTING_BRIEF="$ROUTING_BRIEF_9"
else
  printf '[SKIP] substage-parallelism-flag: no routing brief found\n' >&2
  exit 2
fi

# Require bash 4+ for associative arrays (numeric comparison — forward-compat)
if [[ "${BASH_VERSINFO[0]:-0}" -lt 4 ]]; then
  printf '[SKIP] substage-parallelism-flag: bash 4+ required (found bash %s)\n' \
    "${BASH_VERSION:-unknown}" >&2
  exit 2
fi

declare -A SUBSTAGE_PARALLEL=()   # substage_id -> "N.X N.Y ..." (space-sep)
declare -A SUBSTAGE_OUTPUT=()     # substage_id -> newline-sep output file list

COLLISIONS=0
PAIRS_CHECKED=0

# ─── Pass 1: build maps from routing brief ─────────────────────────────────────
#
# Format expected (routing brief schema):
#   ### N.M — <title>
#   ...
#   - **parallel_safe_with**: [N.X, N.Y]
#   ...
#   - **output_files** (write): [file1, file2]      (single-line form)
#   OR:
#   - **output_files** (write): [file1,
#     file2, file3]                                  (multi-word — handled by greedy capture)

CURRENT_SUBSTAGE=""

while IFS= read -r line; do
  # Detect substage heading: ### N.M  (any number of digits each side of dot)
  if [[ "$line" =~ ^###[[:space:]]+([0-9]+\.[0-9]+(\.[0-9]+)?) ]]; then
    CURRENT_SUBSTAGE="${BASH_REMATCH[1]}"
    continue
  fi

  [[ -z "$CURRENT_SUBSTAGE" ]] && continue

  # Capture parallel_safe_with list
  if [[ "$line" =~ \*\*parallel_safe_with\*\*[[:space:]]*:[[:space:]]*\[([^\]]*)\] ]]; then
    RAW_LIST="${BASH_REMATCH[1]}"
    # Normalize: strip spaces, commas → space-separated ids
    PEER_LIST=$(printf '%s\n' "$RAW_LIST" | tr ',' '\n' | tr -d ' ' | grep -E '^[0-9]+\.[0-9]+(\.[0-9]+)?$' || true)
    PEER_FLAT=$(printf '%s ' $PEER_LIST)
    SUBSTAGE_PARALLEL["$CURRENT_SUBSTAGE"]="${PEER_FLAT% }"
    continue
  fi

  # Capture output_files (write) list — single-line bracket form
  if [[ "$line" =~ \*\*output_files\*\*.*\(write\).*\[([^\]]*)\] ]]; then
    RAW_FILES="${BASH_REMATCH[1]}"
    # Split on commas; trim leading/trailing whitespace from each
    while IFS= read -r fp; do
      fp="${fp#"${fp%%[![:space:]]*}"}"   # ltrim
      fp="${fp%"${fp##*[![:space:]]}"}"   # rtrim
      [[ -n "$fp" ]] || continue
      SUBSTAGE_OUTPUT["$CURRENT_SUBSTAGE"]+="${fp}"$'\n'
    done < <(printf '%s\n' "$RAW_FILES" | tr ',' '\n')
    continue
  fi

done < "$ROUTING_BRIEF"

# ─── Pass 2: check file-edit collisions for all declared parallel pairs ─────────

for SUB_A in "${!SUBSTAGE_PARALLEL[@]}"; do
  PEERS="${SUBSTAGE_PARALLEL[$SUB_A]}"
  [[ -z "$PEERS" ]] && continue

  FILES_A="${SUBSTAGE_OUTPUT[$SUB_A]:-}"

  for SUB_B in $PEERS; do
    # Avoid double-counting (A∥B and B∥A): only process each pair once.
    # Compare by splitting on '.' and comparing major then minor as integers.
    # String '<' would mis-order: "9.10" < "9.2" = true (WRONG); integer split handles it correctly.
    IFS='.' read -r A_MAJ A_MIN <<< "$SUB_A"
    IFS='.' read -r B_MAJ B_MIN <<< "$SUB_B"
    A_MAJ="${A_MAJ:-0}"; A_MIN="${A_MIN:-0}"
    B_MAJ="${B_MAJ:-0}"; B_MIN="${B_MIN:-0}"
    # Only process pair when A < B (numerically): skip if A >= B
    if [[ "$A_MAJ" -gt "$B_MAJ" ]] || { [[ "$A_MAJ" -eq "$B_MAJ" ]] && [[ "$A_MIN" -ge "$B_MIN" ]]; }; then
      continue
    fi

    FILES_B="${SUBSTAGE_OUTPUT[$SUB_B]:-}"

    PAIRS_CHECKED=$((PAIRS_CHECKED + 1))

    # Skip collision check if either substage has no declared output files
    [[ -z "$FILES_A" || -z "$FILES_B" ]] && continue

    # Intersection check
    while IFS= read -r fa; do
      [[ -z "$fa" ]] && continue
      if printf '%s\n' "$FILES_B" | grep -qxF "$fa" 2>/dev/null; then
        COLLISIONS=$((COLLISIONS + 1))
        printf '[FAIL] G.7 collision: %s ∥ %s both declare output file: %s\n' \
          "$SUB_A" "$SUB_B" "$fa" >&2
      fi
    done < <(printf '%s\n' "$FILES_A")
  done
done

# ─── Result ──────────────────────────────────────────────────────────────────────

if [[ "$PAIRS_CHECKED" -eq 0 ]]; then
  printf '[SKIP] substage-parallelism-flag: routing brief parsed but no parallel_safe_with entries found (PAIRS_CHECKED=0)\n' >&2
  exit 2
fi

if [[ "$COLLISIONS" -eq 0 ]]; then
  printf '[PASS] substage-parallelism-flag: %d pair(s) checked, no file-edit collisions\n' "$PAIRS_CHECKED"
  exit 0
else
  printf '[FAIL] substage-parallelism-flag: %d collision(s) across %d parallel pair(s)\n' \
    "$COLLISIONS" "$PAIRS_CHECKED" >&2
  exit 1
fi
