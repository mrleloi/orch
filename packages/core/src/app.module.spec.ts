/**
 * AppModule spec
 *
 * Covers:
 *  - AppModule metadata includes all required feature modules
 *  - AppModule.onModuleInit calls initOrchContext with the four dependencies
 *  - OrchContext is populated after onModuleInit runs
 *  - Full NestJS DI compiles without UnknownDependenciesException (DI health check)
 *
 * Strategy A (unit): test AppModule's onModuleInit by constructing it with mocks
 * directly, bypassing the full NestJS DI graph (which requires a real DB connection).
 * Strategy B (DI compile): use Test.createTestingModule({ imports: [AppModule] })
 * with PrismaService overridden to avoid a real DB connection. All other providers
 * resolve through real DI — this validates that design:paramtypes metadata is correct
 * and no interface injection bugs remain.
 *
 * I-14: no domain/ imports beyond context functions.
 */

import 'reflect-metadata';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module.js';
import {
  hasOrchContext,
  getOrchContext,
  resetOrchContextForTest,
} from './domain/context.js';
import { DbModule } from './modules/db/prisma.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { TracingModule } from './modules/tracing/tracing.module.js';
import { SecurityModule } from './modules/security/security.module.js';
import { ProjectRegistryModule } from './modules/project-registry/project-registry.module.js';
import { QueueModule } from './modules/queue/queue.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { HooksModule } from './modules/hooks/hooks.module.js';
import { ApiModule } from './modules/api/api.module.js';
import { NotifierModule } from './modules/notifier/notifier.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaService } from './modules/db/prisma.service.js';
import { OrchStoreService } from './modules/db/orch-store.service.js';
import { SessionManager } from './modules/sessions/session-manager.js';
import { EventBusService } from './modules/events/event-bus.service.js';
import type { IOrchStore } from './domain/types/store.js';
import type { IAgentRuntime } from './domain/types/runtime.js';
import type { INotifier } from './domain/types/notifier.js';
import type { ITracer } from './domain/types/tracer.js';

// ── Minimal stubs ─────────────────────────────────────────────────────────────

const storeMock: IOrchStore = {
  getSession: jest.fn(),
  createSession: jest.fn(),
  updateSession: jest.fn(),
  listActiveSessions: jest.fn().mockResolvedValue([]),
  createQueueItem: jest.fn(),
  getQueueItem: jest.fn(),
  updateQueueItem: jest.fn(),
  listQueueItems: jest.fn().mockResolvedValue([]),
  createHookEvent: jest.fn(),
  findHookEventByDedupKey: jest.fn(),
  withTransaction: jest.fn(),
  acquireSessionLock: jest.fn(),
  renewSessionLock: jest.fn(),
  releaseSessionLock: jest.fn(),
} as unknown as IOrchStore;

const runtimeMock: IAgentRuntime = {
  spawn: jest.fn(),
  resume: jest.fn(),
  terminate: jest.fn(),
} as unknown as IAgentRuntime;

const notifierMock: INotifier = {
  notify: jest.fn().mockResolvedValue(undefined),
};

const tracerMock: ITracer = {
  withSpan: jest.fn().mockImplementation(async (_name, fn) =>
    fn({
      setAttribute: jest.fn(),
      addEvent: jest.fn(),
      setStatus: jest.fn(),
      recordException: jest.fn(),
      end: jest.fn(),
    }),
  ),
  startSpan: jest.fn().mockReturnValue({
    setAttribute: jest.fn(),
    addEvent: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  }),
};

// ── Migration SQL loader (shared with DI compile test) ────────────────────────

const MIGRATIONS_DIR = path.join(__dirname, '../prisma/migrations');

function readAllMigrations(): string {
  const migrationFolders = fs
    .readdirSync(MIGRATIONS_DIR)
    .sort()
    .filter((d) => fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory());
  return migrationFolders
    .map((folder) =>
      fs.readFileSync(path.join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf8'),
    )
    .join('\n');
}

function createTestDb(): string {
  const tmp = path.join(os.tmpdir(), `orch-appmod-${process.pid}-${Date.now()}.db`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default;
  const db = new Database(tmp);
  db.exec(readAllMigrations());
  db.close();
  return tmp;
}

// ── Helper to retrieve AppModule imports metadata ─────────────────────────────

function getModuleImports(moduleClass: new (...args: unknown[]) => unknown): unknown[] {
  // NestJS stores module metadata under the MODULE_METADATA symbol
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return (Reflect.getMetadata('imports', moduleClass) as unknown[]) ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AppModule', () => {
  afterEach(() => {
    resetOrchContextForTest();
  });

  describe('module metadata — feature modules wired', () => {
    it('imports DbModule', () => {
      const imports = getModuleImports(AppModule);
      expect(imports).toContain(DbModule);
    });

    it('imports EventsModule', () => {
      expect(getModuleImports(AppModule)).toContain(EventsModule);
    });

    it('imports TracingModule', () => {
      expect(getModuleImports(AppModule)).toContain(TracingModule);
    });

    it('imports SecurityModule', () => {
      expect(getModuleImports(AppModule)).toContain(SecurityModule);
    });

    it('imports ProjectRegistryModule', () => {
      expect(getModuleImports(AppModule)).toContain(ProjectRegistryModule);
    });

    it('imports QueueModule', () => {
      expect(getModuleImports(AppModule)).toContain(QueueModule);
    });

    it('imports SessionsModule', () => {
      expect(getModuleImports(AppModule)).toContain(SessionsModule);
    });

    it('imports HooksModule', () => {
      expect(getModuleImports(AppModule)).toContain(HooksModule);
    });

    it('imports ApiModule', () => {
      expect(getModuleImports(AppModule)).toContain(ApiModule);
    });

    it('imports NotifierModule', () => {
      expect(getModuleImports(AppModule)).toContain(NotifierModule);
    });

    it('imports HealthModule', () => {
      expect(getModuleImports(AppModule)).toContain(HealthModule);
    });
  });

  describe('onModuleInit — OrchContext population', () => {
    it('populates OrchContext with all four deps', () => {
      expect(hasOrchContext()).toBe(false);

      // Construct AppModule manually with mocked deps
      const appModule = new AppModule(
        storeMock as never,
        runtimeMock as never,
        notifierMock as never,
        tracerMock as never,
      );

      appModule.onModuleInit();

      expect(hasOrchContext()).toBe(true);
    });

    it('OrchContext has the injected store', () => {
      const appModule = new AppModule(
        storeMock as never,
        runtimeMock as never,
        notifierMock as never,
        tracerMock as never,
      );

      appModule.onModuleInit();

      const ctx = getOrchContext();
      expect(ctx.store).toBe(storeMock);
    });

    it('OrchContext has the injected runtime', () => {
      const appModule = new AppModule(
        storeMock as never,
        runtimeMock as never,
        notifierMock as never,
        tracerMock as never,
      );

      appModule.onModuleInit();

      const ctx = getOrchContext();
      expect(ctx.runtime).toBe(runtimeMock);
    });

    it('OrchContext has the injected notifier', () => {
      const appModule = new AppModule(
        storeMock as never,
        runtimeMock as never,
        notifierMock as never,
        tracerMock as never,
      );

      appModule.onModuleInit();

      const ctx = getOrchContext();
      expect(ctx.notifier).toBe(notifierMock);
    });

    it('OrchContext has the injected tracer', () => {
      const appModule = new AppModule(
        storeMock as never,
        runtimeMock as never,
        notifierMock as never,
        tracerMock as never,
      );

      appModule.onModuleInit();

      const ctx = getOrchContext();
      expect(ctx.tracer).toBe(tracerMock);
    });
  });

  describe('DI compile — full NestJS module graph resolves', () => {
    /**
     * Verifies that the full NestJS DI graph compiles without errors.
     *
     * PrismaService is overridden to skip the real DB connection (hostile
     * side-effect). All other providers resolve through real DI — this
     * validates that design:paramtypes metadata is correct and no interface
     * injection bugs remain (e.g., the IOrchStore → OrchStoreService fix).
     *
     * If this test throws UnknownDependenciesException, a DI wiring bug was
     * reintroduced.
     */
    let diModule: TestingModule;
    let testDbPath: string;

    beforeEach(async () => {
      testDbPath = createTestDb();
      process.env['DATABASE_URL'] = `file:${testDbPath}`;

      diModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        // Override PrismaService so it doesn't try to connect to a real DB
        // during onModuleInit. All other providers use real DI resolution.
        .overrideProvider(PrismaService)
        .useValue({
          $connect: jest.fn().mockResolvedValue(undefined),
          $disconnect: jest.fn().mockResolvedValue(undefined),
          $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
          $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
          onModuleInit: jest.fn().mockResolvedValue(undefined),
          onModuleDestroy: jest.fn().mockResolvedValue(undefined),
          session: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
          queueItem: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
          hookEvent: { create: jest.fn() },
          project: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
          sessionLock: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
          handoffContext: { create: jest.fn(), findMany: jest.fn() },
        })
        .compile();
    });

    afterEach(async () => {
      resetOrchContextForTest();
      await diModule.close();
      try {
        fs.unlinkSync(testDbPath);
        fs.unlinkSync(`${testDbPath}-wal`);
        fs.unlinkSync(`${testDbPath}-shm`);
      } catch {
        // files may not exist — ignore
      }
      delete process.env['DATABASE_URL'];
    });

    it('compiles without UnknownDependenciesException', () => {
      // If we reach here, the DI graph compiled successfully
      expect(diModule).toBeDefined();
    });

    it('resolves OrchStoreService', () => {
      expect(diModule.get(OrchStoreService)).toBeDefined();
    });

    it('resolves SessionManager', () => {
      expect(diModule.get(SessionManager)).toBeDefined();
    });

    it('resolves EventBusService', () => {
      expect(diModule.get(EventBusService)).toBeDefined();
    });

    it('onModuleInit populates OrchContext', async () => {
      // Call onModuleInit — should not throw
      const appModule = diModule.get(AppModule);
      expect(() => appModule.onModuleInit()).not.toThrow();
      expect(hasOrchContext()).toBe(true);
    });
  });
});
