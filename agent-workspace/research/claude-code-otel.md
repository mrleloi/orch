# Research: claude-code-otel

**Repo**: https://github.com/ColeMurray/claude-code-otel
**Clone**: C:/htdocs/orch-starter/reference-repos/claude-code-otel/
**Studied**: 2026-04-24
**License**: MIT — fully compatible, no restrictions on use or adaptation
**Tier**: C (config-repo reference)
**Verdict**: BORROW — near-complete lift of the full docker stack

---

## What It Does

Pre-built docker-compose observability stack that receives Claude Code OTEL telemetry and visualises it in Grafana. No application code; all config files. Exactly what Orch Phase 3 needs.

---

## Backends Supported

| Backend | Role | Port |
|---------|------|------|
| OpenTelemetry Collector (contrib) | Receiver + fan-out | 4317 gRPC, 4318 HTTP in; 8889 Prometheus scrape out |
| Prometheus | Metrics storage | 9090 |
| Loki | Log/event storage | 3100 |
| Grafana OSS | Dashboards | 3000 |

No Langfuse, no SigNoz, no Jaeger. Backend is purely the LGTM stack (Loki+Grafana+Tempo+Mimir subset). Grafana datasources.yml also references alertmanager on 9093 but no alertmanager service is defined in docker-compose — dead reference, ignore.

Also ships `docker-compose-lgtm.yml`: single-container alternative using `grafana/otel-lgtm:1.4.0` that bundles OTLP receiver + Prometheus + Loki + Grafana all-in-one. Exposes same ports (3000, 4317, 4318). Useful for minimal dev footprint.

---

## OTEL Collector Config (collector-config.yaml)

```
Receivers:  otlp/grpc 0.0.0.0:4317, otlp/http 0.0.0.0:4318
Processors: resource (upserts attribute environment="production")
Exporters:
  metrics → prometheus endpoint 0.0.0.0:8889 + debug
  logs    → otlphttp http://loki:3100/otlp + debug
Pipelines:
  metrics: otlp → resource → [prometheus, debug]
  logs:    otlp → resource → [debug, otlphttp]
```

No traces pipeline. Claude Code does not emit traces, only metrics + logs/events.

---

## Claude Code Env Vars (from README Quick Start)

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
# Optional tuning for faster local feedback:
OTEL_METRIC_EXPORT_INTERVAL=10000   # ms
OTEL_LOGS_EXPORT_INTERVAL=5000      # ms
```

No `.env.example` file in repo. Env vars are documented in README only.

---

## Claude Code Metrics Emitted (from README)

Metrics:
- `claude_code.session.count`
- `claude_code.lines_of_code.count`
- `claude_code.pull_request.count`
- `claude_code.commit.count`
- `claude_code.cost.usage` (by model)
- `claude_code.token.usage` (input/output/cache/creation)
- `claude_code.code_edit_tool.decision`

Events (as logs/spans):
- `claude_code.user_prompt`
- `claude_code.tool_result`
- `claude_code.api_request`
- `claude_code.api_error`
- `claude_code.tool_decision`

---

## Docker Resource Footprint

Full stack (docker-compose.yml): 4 containers
- otel/opentelemetry-collector-contrib:latest (~50 MB image, noted in compose comment)
- prom/prometheus:latest
- grafana/loki:latest
- grafana/grafana-oss:latest

Estimated total idle RAM: ~400-600 MB. Acceptable for a dev machine / CI host.

Minimal stack (docker-compose-lgtm.yml): 1 container
- grafana/otel-lgtm:1.4.0 — all-in-one, same ports, lower ops overhead.

---

## Directly Copy-able Files (Phase 3 can lift as-is)

| File | Action | Notes |
|------|--------|-------|
| `collector-config.yaml` | COPY directly | Only change: rename environment tag |
| `docker-compose-lgtm.yml` | COPY directly | Best for Phase 3 minimal dev path |
| `prometheus.yml` | COPY directly | Single scrape job, trivial |
| `grafana-datasources.yml` | COPY with edit | Remove dead alertmanager entry |
| `grafana-dashboards.yml` | COPY directly | Provisioning pointer file |
| `claude-code-dashboard.json` | COPY directly | Pre-built dashboard; very large JSON |
| `docker-compose.yml` | COPY + adapt | Full stack; adapt network name + pin image tags (currently all :latest) |

Files to skip:
- `Makefile` — wraps docker compose; useful but project-specific targets
- `CLAUDE_OBSERVABILITY.md` — background reading only
- `CONTRIBUTING.md` — irrelevant
- `docs/images/` — screenshots only

---

## Adaptation Notes for Orch Phase 3

1. Pin image tags. All `:latest` in docker-compose.yml is brittle. Pin before shipping.
2. The alertmanager datasource in grafana-datasources.yml references a service not in compose — remove it or add the service.
3. resource processor hard-codes `environment: "production"` — parameterise via env var.
4. For Orch specifically: Orch daemon itself (Node/NestJS) will want to emit its own spans. Add a traces pipeline (otlp → debug/jaeger) even if Claude Code does not emit traces. The contrib collector already supports it.
5. lgtm single-container variant is the right default for Orch's dev setup; full 4-container stack is the production option.

---

## Borrow / Skip / Learn Summary

| Category | Item |
|----------|------|
| BORROW | collector-config.yaml — exact receiver/exporter/pipeline structure |
| BORROW | docker-compose-lgtm.yml — single-container minimal stack |
| BORROW | claude-code-dashboard.json — pre-built Grafana dashboard |
| BORROW | grafana-datasources.yml (with alertmanager line removed) |
| LEARN | Full 4-container stack pattern for production variant |
| SKIP | Makefile (too project-specific) |
| SKIP | No Langfuse / SigNoz here — if Orch wants those, look elsewhere |

---

## License

MIT. No attribution requirement for config files. Safe to include verbatim in Orch repo.
