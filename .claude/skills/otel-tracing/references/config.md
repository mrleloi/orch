# Config

SDK setup (`createSdk`), bootstrap in `main.ts`, env vars, shutdown.

## SDK Setup

`packages/core/src/modules/tracing/sdk.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export function createSdk(config: TracingConfig): NodeSDK | null {
  if (!config.enabled) return null;

  return new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName ?? 'orch',
      [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '1.0.0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: config.otlpEndpoint + '/v1/traces',
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: config.otlpEndpoint + '/v1/metrics',
      }),
      exportIntervalMillis: 10_000,
    }),
    instrumentations: [getNodeAutoInstrumentations({
      // Disable noisy ones
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });
}
```

## Bootstrap in main.ts

Bootstrap BEFORE `NestFactory.create`:

```typescript
import { createSdk } from './modules/tracing/sdk';

const sdk = createSdk({
  enabled: process.env.ORCH_OTEL_ENABLED !== 'false',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
  serviceName: 'orch',
});

sdk?.start();

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);

// ... lifecycle

app.enableShutdownHooks();

process.on('SIGTERM', async () => {
  await app.close();
  await sdk?.shutdown();
});
```

## Shutdown

```typescript
// Graceful
await sdk.shutdown(); // flushes pending spans

// Max wait 5s
await Promise.race([
  sdk.shutdown(),
  new Promise(r => setTimeout(r, 5000)),
]);
```

Missing shutdown → last spans lost.

## Anti-Patterns

- Forgetting to set OTEL env vars in spawned subprocess env
- `sdk.start()` AFTER app code that does IO (instrumentation misses early calls)

## Env Vars

- `ORCH_OTEL_ENABLED` — `false` disables SDK creation entirely
- `OTEL_EXPORTER_OTLP_ENDPOINT` — collector or backend URL (default `http://localhost:4318`)
- `OTEL_SERVICE_NAME` — service identifier in traces
