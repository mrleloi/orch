#!/usr/bin/env bash
# measure-rss.sh — Generic PID-based RSS sampler for memory-leak verification.
#
# Samples the RSS (Resident Set Size) of a process every M seconds for N seconds total,
# appending each reading to a CSV file. After the run, computes (max - min) RSS delta
# and exits 0 if delta < 50 MB, exits 1 if delta >= 50 MB.
#
# Usage:
#   bash scripts/utilities/measure-rss.sh --pid <PID> --duration-sec <N> --interval-sec <M>
#   bash scripts/utilities/measure-rss.sh --help
#
# Options:
#   --pid <PID>            PID of the process to monitor (required)
#   --duration-sec <N>     Total sampling duration in seconds (default: 14400, i.e. 4h)
#   --interval-sec <M>     Sampling interval in seconds (default: 60)
#   --output-csv <PATH>    CSV output path (default: /tmp/rss-<PID>-<TS>.csv)
#   --threshold-mb <T>     Fail threshold in MB (default: 50)
#   --help                 Show this help text and exit
#
# CSV format: timestamp_iso,rss_kb
#
# Charter reference: N6 (72h memory-leak verification, RSS delta < 50 MB)
# Platform: Linux/macOS. Windows note: use Get-Process -Id <PID> | Select WorkingSet64.

set -euo pipefail

# ─── Defaults ──────────────────────────────────────────────────────────────────
PID=""
DURATION_SEC=14400     # 4 hours
INTERVAL_SEC=60
OUTPUT_CSV=""
THRESHOLD_MB=50

# ─── Argument parsing ──────────────────────────────────────────────────────────
print_help() {
  sed -n '3,23p' "$0"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)       print_help ;;
    --pid)           PID="${2:?'--pid requires a value'}";           shift 2 ;;
    --duration-sec)  DURATION_SEC="${2:?'--duration-sec requires a value'}"; shift 2 ;;
    --interval-sec)  INTERVAL_SEC="${2:?'--interval-sec requires a value'}"; shift 2 ;;
    --output-csv)    OUTPUT_CSV="${2:?'--output-csv requires a value'}"; shift 2 ;;
    --threshold-mb)  THRESHOLD_MB="${2:?'--threshold-mb requires a value'}"; shift 2 ;;
    *) printf 'Unknown argument: %s\nRun --help for usage.\n' "$1" >&2; exit 2 ;;
  esac
done

if [[ -z "$PID" ]]; then
  printf 'Error: --pid is required.\nRun --help for usage.\n' >&2
  exit 2
fi

# ─── Output path ───────────────────────────────────────────────────────────────
TS_START="$(date '+%Y%m%dT%H%M%S' 2>/dev/null || date -u '+%Y%m%dT%H%M%S')"
if [[ -z "$OUTPUT_CSV" ]]; then
  OUTPUT_CSV="${TMPDIR:-/tmp}/rss-${PID}-${TS_START}.csv"
fi
printf 'timestamp_iso,rss_kb\n' > "$OUTPUT_CSV"

# ─── Sampling loop ─────────────────────────────────────────────────────────────
ELAPSED=0
SAMPLE_COUNT=0
MIN_RSS=""
MAX_RSS=""

printf '[measure-rss] PID=%s  duration=%ds  interval=%ds  output=%s\n' \
  "$PID" "$DURATION_SEC" "$INTERVAL_SEC" "$OUTPUT_CSV" >&2

while [[ "$ELAPSED" -le "$DURATION_SEC" ]]; do
  RSS_KB="$(ps -o rss= -p "$PID" 2>/dev/null | tr -d ' ')" || true

  if [[ -n "$RSS_KB" && "$RSS_KB" =~ ^[0-9]+$ ]]; then
    TS_NOW="$(date -Iseconds 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf '%s,%s\n' "$TS_NOW" "$RSS_KB" >> "$OUTPUT_CSV"
    SAMPLE_COUNT=$(( SAMPLE_COUNT + 1 ))

    if [[ -z "$MIN_RSS" || "$RSS_KB" -lt "$MIN_RSS" ]]; then MIN_RSS="$RSS_KB"; fi
    if [[ -z "$MAX_RSS" || "$RSS_KB" -gt "$MAX_RSS" ]]; then MAX_RSS="$RSS_KB"; fi
  else
    printf '[measure-rss] WARNING: could not read RSS for PID %s at elapsed=%ds\n' \
      "$PID" "$ELAPSED" >&2
  fi

  if [[ "$ELAPSED" -ge "$DURATION_SEC" ]]; then break; fi

  NEXT_SLEEP=$(( INTERVAL_SEC < DURATION_SEC - ELAPSED ? INTERVAL_SEC : DURATION_SEC - ELAPSED ))
  sleep "$NEXT_SLEEP"
  ELAPSED=$(( ELAPSED + NEXT_SLEEP ))
done

# ─── Summary ───────────────────────────────────────────────────────────────────
if [[ "$SAMPLE_COUNT" -eq 0 ]]; then
  printf '[measure-rss] ERROR: no samples collected. Is PID %s alive?\n' "$PID" >&2
  exit 2
fi

THRESHOLD_KB=$(( THRESHOLD_MB * 1024 ))
DELTA_KB=$(( MAX_RSS - MIN_RSS ))
DELTA_MB_INT=$(( DELTA_KB / 1024 ))
DELTA_MB_FRAC=$(( (DELTA_KB % 1024) * 10 / 1024 ))

if [[ "$DELTA_KB" -lt "$THRESHOLD_KB" ]]; then
  VERDICT="PASS"
  EXIT_CODE=0
else
  VERDICT="FAIL"
  EXIT_CODE=1
fi

printf 'RSS delta: %d.%d MB (%s)  [min=%d KB  max=%d KB  samples=%d  csv=%s]\n' \
  "$DELTA_MB_INT" "$DELTA_MB_FRAC" "$VERDICT" "$MIN_RSS" "$MAX_RSS" "$SAMPLE_COUNT" "$OUTPUT_CSV"

exit "$EXIT_CODE"
