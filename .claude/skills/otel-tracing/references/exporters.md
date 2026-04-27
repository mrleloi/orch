# Exporters

Langfuse + SigNoz config, docker-compose, OTLP endpoint setup.

## Langfuse (default)

Langfuse accepts OTLP via its `/v1/traces` endpoint (or through an OTEL collector).

Docker compose:
```yaml
# docker/docker-compose.observability.yml
services:
  langfuse-db:
    image: postgres:15
    environment:
      POSTGRES_USER: langfuse
      POSTGRES_PASSWORD: langfuse
      POSTGRES_DB: langfuse
    volumes:
      - langfuse-data:/var/lib/postgresql/data

  langfuse:
    image: langfuse/langfuse:2
    ports:
      - "3001:3000"
    environment:
      DATABASE_URL: postgres://langfuse:langfuse@langfuse-db:5432/langfuse
      NEXTAUTH_URL: http://localhost:3001
      NEXTAUTH_SECRET: ${LANGFUSE_SECRET}
      SALT: ${LANGFUSE_SALT}
    depends_on:
      - langfuse-db

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config", "/etc/otel/config.yaml"]
    volumes:
      - ./otel-collector.yaml:/etc/otel/config.yaml
    ports:
      - "4317:4317"  # gRPC
      - "4318:4318"  # HTTP

volumes:
  langfuse-data:
```

Point Orch at collector:
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Point Claude Code at the same (or collector forwards to Langfuse):
```json
// .claude/settings.json env
"OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318"
```

## SigNoz (alternative)

Similar pattern — point OTLP endpoint to SigNoz collector port.
