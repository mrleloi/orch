#!/usr/bin/env bash
# otel-up.sh — bring up the local Grafana LGTM observability stack for Orch.
# Usage:
#   bash scripts/dev/otel-up.sh            # start in background
#   bash scripts/dev/otel-up.sh down       # stop + remove
#   bash scripts/dev/otel-up.sh logs       # follow container logs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker/otel-stack/docker-compose-lgtm.yml"

cmd="${1:-up}"
case "$cmd" in
  up)
    docker compose -f "$COMPOSE_FILE" up -d
    echo ""
    echo "LGTM stack up. Grafana → http://127.0.0.1:3000 (admin/admin)"
    echo "OTLP endpoints: gRPC :4317, HTTP :4318"
    ;;
  down)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  logs)
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;
  config)
    docker compose -f "$COMPOSE_FILE" config
    ;;
  *)
    echo "Usage: $(basename "$0") [up|down|logs|config]" >&2
    exit 2
    ;;
esac
