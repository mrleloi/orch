/**
 * TracingModule spec — Task 2.9 update
 *
 * Verifies TracingModule behavior after R4 fix: the module no longer creates its
 * own NodeSDK. Instead it delegates to bootstrapTracing() (pre-started in main.ts).
 *
 * Tests:
 *  1. Module initializes without throwing when SDK is pre-started
 *  2. Module warns (does not throw) when SDK was not pre-started (test-harness case)
 *  3. TracingService is available from the module
 *  4. OTEL_METRICS_EXPORTER=none is preserved (set by bootstrapTracing before module init)
 *
 * I-13: uses in-memory / unreachable-endpoint SDK; no real OTLP traffic.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { TracingModule } from './tracing.module.js';
import { TracingService } from './tracing.service.js';
import { TracingInitError } from './tracing.errors.js';
import {
  bootstrapTracing,
  shutdownTracing,
  _resetSdkForTest,
} from '../../tracing-bootstrap.js';
import { EventsModule } from '../events/events.module.js';
import { ProjectRegistryService } from '../project-registry/project-registry.service.js';

const TEST_ENDPOINT = 'http://127.0.0.1:1'; // unreachable — safe for tests

/**
 * Minimal stub for ProjectRegistryService.
 *
 * ContextBudgetModule imports ProjectRegistryModule to access ProjectRegistryService.
 * In these unit tests we only want to test TracingModule behavior, not the full
 * registry. We override ProjectRegistryService with a no-op stub to avoid pulling
 * in DbModule and its SQLite database requirement.
 */
const stubProjectRegistry = {
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
  listProjects: jest.fn().mockResolvedValue([]),
  getProject: jest.fn().mockResolvedValue(undefined),
  reload: jest.fn().mockResolvedValue({ added: 0, updated: 0, removed: 0, errors: [] }),
  cache: new Map(),
};

function buildTracingModuleWithStubs() {
  return Test.createTestingModule({
    imports: [
      EventsModule,
      TracingModule,
    ],
  }).overrideProvider(ProjectRegistryService).useValue(stubProjectRegistry);
}

describe('TracingModule — post-R4 behavior', () => {
  const originalMetricsExporter = process.env['OTEL_METRICS_EXPORTER'];
  const originalEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

  beforeEach(() => {
    delete process.env['OTEL_METRICS_EXPORTER'];
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = TEST_ENDPOINT;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await shutdownTracing();
    _resetSdkForTest();
    if (originalMetricsExporter === undefined) {
      delete process.env['OTEL_METRICS_EXPORTER'];
    } else {
      process.env['OTEL_METRICS_EXPORTER'] = originalMetricsExporter;
    }
    if (originalEndpoint === undefined) {
      delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    } else {
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = originalEndpoint;
    }
  });

  it('initializes without throwing when SDK was pre-started by bootstrapTracing()', async () => {
    // Simulate production: bootstrap runs before NestFactory
    bootstrapTracing({
      endpoint: TEST_ENDPOINT,
      serviceName: 'orch-test',
      serviceVersion: '0.0.0',
    });

    let module: TestingModule | undefined;
    let initError: unknown = null;
    try {
      module = await buildTracingModuleWithStubs().compile();
      await module.init();
    } catch (err) {
      initError = err;
    }

    expect(initError).toBeNull();

    if (module) {
      await module.close();
    }
  }, 10_000);

  it('initializes without throwing even when SDK was NOT pre-started (warns only) — NODE_ENV=test', async () => {
    // SDK NOT pre-started: simulates test harnesses that skip tracing-bootstrap-startup.
    // NODE_ENV is already 'test' (set by jest.setup.ts) so warn-and-continue applies.
    _resetSdkForTest();

    const warnSpy = jest.spyOn(Logger.prototype, 'warn');

    let module: TestingModule | undefined;
    let initError: unknown = null;
    try {
      module = await buildTracingModuleWithStubs().compile();
      await module.init();
    } catch (err) {
      initError = err;
    }

    // Must NOT throw — warn-and-continue (I-12)
    expect(initError).toBeNull();
    // Should have logged a warning about SDK not being pre-started
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'tracing:sdk-not-pre-started' }),
    );

    if (module) {
      await module.close();
    }
  }, 10_000);

  it('throws TracingInitError when SDK was NOT pre-started in production (NODE_ENV != test)', async () => {
    // Simulate production: no test harness env vars, NODE_ENV=production
    const origNodeEnv = process.env['NODE_ENV'];
    const origJestWorker = process.env['JEST_WORKER_ID'];
    const origVitestWorker = process.env['VITEST_WORKER_ID'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['JEST_WORKER_ID'];
    delete process.env['VITEST_WORKER_ID'];

    _resetSdkForTest();

    let initError: unknown = null;
    let module: TestingModule | undefined;
    try {
      module = await buildTracingModuleWithStubs().compile();
      await module.init();
    } catch (err) {
      initError = err;
    } finally {
      // Restore env vars before any assertions so cleanup is always done
      if (origNodeEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = origNodeEnv;
      }
      if (origJestWorker === undefined) {
        delete process.env['JEST_WORKER_ID'];
      } else {
        process.env['JEST_WORKER_ID'] = origJestWorker;
      }
      if (origVitestWorker === undefined) {
        delete process.env['VITEST_WORKER_ID'];
      } else {
        process.env['VITEST_WORKER_ID'] = origVitestWorker;
      }
      if (module) {
        // Module may not have been initialized; close silently
        try {
          await module.close();
        } catch {
          // ignore
        }
      }
    }

    // Must THROW in production when SDK is not pre-started
    expect(initError).toBeInstanceOf(TracingInitError);
  }, 10_000);

  it('TracingService is available from the module', async () => {
    bootstrapTracing({
      endpoint: TEST_ENDPOINT,
      serviceName: 'orch-test',
      serviceVersion: '0.0.0',
    });

    const module = await buildTracingModuleWithStubs().compile();

    const tracingService = module.get(TracingService);
    expect(tracingService).toBeDefined();
    expect(typeof tracingService.withSpan).toBe('function');

    await module.close();
  }, 10_000);

  it('does not override OTEL_METRICS_EXPORTER when already set to console', async () => {
    process.env['OTEL_METRICS_EXPORTER'] = 'console';

    // bootstrapTracing should preserve the 'console' value
    bootstrapTracing({
      endpoint: TEST_ENDPOINT,
      serviceName: 'orch-test',
      serviceVersion: '0.0.0',
    });

    expect(process.env['OTEL_METRICS_EXPORTER']).toBe('console');

    const module = await buildTracingModuleWithStubs().compile();
    await module.init();

    expect(process.env['OTEL_METRICS_EXPORTER']).toBe('console');

    await module.close();
  }, 10_000);
});
