# Orch OTEL Stack — Grafana LGTM

Local observability backend for Claude Code telemetry. Single-container Grafana LGTM stack
(Loki + Grafana + Tempo + Mimir) with a pre-built Claude Code dashboard.

Source: [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel) (MIT)

---

## Quick Start (3 commands)

**1. Start the stack**

```bash
docker compose -f docker/otel-stack/docker-compose-lgtm.yml up -d
```

**2. Open Grafana**

Navigate to [http://127.0.0.1:3000](http://127.0.0.1:3000)

Credentials: `admin` / `admin`

The pre-built Claude Code dashboard is provisioned automatically.

**3. Stop the stack**

```bash
docker compose -f docker/otel-stack/docker-compose-lgtm.yml down
```

Or use the convenience scripts:

```bash
# Bash
scripts/dev/otel-up.sh

# PowerShell
scripts/dev/otel-up.ps1
```

---

## OTLP Endpoints

| Protocol | Endpoint | Use |
|----------|----------|-----|
| gRPC | `http://localhost:4317` | Default for Claude Code |
| HTTP | `http://localhost:4318` | Alternative / browser SDK |

---

## Claude Code Configuration

Set these env vars before running `claude`:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Optional: faster local feedback
export OTEL_METRIC_EXPORT_INTERVAL=10000
export OTEL_LOGS_EXPORT_INTERVAL=5000
```

---

## Files

| File | Purpose |
|------|---------|
| `docker-compose-lgtm.yml` | Single-container LGTM stack (default dev path) |
| `collector-config.yaml` | OTel Collector config (full 4-container stack) |
| `prometheus.yml` | Prometheus scrape config (full stack) |
| `grafana-datasources.yml` | Grafana datasource provisioning |
| `grafana-dashboards.yml` | Grafana dashboard provisioning pointer |
| `dashboards/claude-code-dashboard.json` | Pre-built Claude Code Grafana dashboard |

---

## Notes

- The LGTM single-container image (`grafana/otel-lgtm:1.4.0`) bundles an OTLP receiver,
  Prometheus, Loki, and Grafana in one container. No separate collector needed.
- `collector-config.yaml` and `prometheus.yml` are for the full 4-container stack
  (`docker-compose.yml` from the upstream repo). Not used by the default lgtm compose.
- Default Grafana credentials are `admin/admin`. Change via `GF_SECURITY_ADMIN_PASSWORD`
  env var if exposing beyond localhost.
- The alertmanager datasource has been removed from `grafana-datasources.yml` — the
  upstream repo referenced it but no alertmanager service was defined.
