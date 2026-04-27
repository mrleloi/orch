/**
 * ProjectRegistryService spec
 *
 * Tests use a temp directory for ORCH_HOME (I-13: fully isolated, not real ~/.orch/).
 * The OrchStoreService is mocked to avoid DB setup overhead in these unit tests.
 * EventBusService is backed by a real EventEmitter2 instance so we can capture events.
 *
 * Covers:
 *  - Happy path: valid yaml → project.registered emitted → getProject() returns it
 *  - Invalid yaml: zod error → ProfileValidationError captured, service keeps running
 *  - File change (watcher): mtime bump → project.updated emitted
 *  - File delete (watcher): unlink → project.removed emitted
 *  - reload() returns correct added/updated/removed/errors counts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as jsYaml from 'js-yaml';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { ProjectRegistryService } from './project-registry.service.js';
import { OrchStoreService } from '../db/orch-store.service.js';
import { EventBusService } from '../events/event-bus.service.js';
import { ProfileValidationError } from '../../domain/errors.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTempOrchHome(): string {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'orch-registry-test-'),
  );
  fs.mkdirSync(path.join(dir, 'projects'), { recursive: true });
  return dir;
}

function writeYamlProfile(dir: string, filename: string, data: unknown): string {
  const filePath = path.join(dir, 'projects', filename);
  fs.writeFileSync(filePath, jsYaml.dump(data), 'utf8');
  return filePath;
}

function validProfileData(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    projectId: 'test-project',
    rootPath: '/tmp/test-project',
    sessionTypes: [
      {
        name: 'impl',
        promptTemplate: 'Execute plan: {{plan}}',
        maxConcurrent: 1,
      },
    ],
    hookTargets: [],
    queueSources: [],
    ccsProfile: 'default',
    maxConcurrentSessions: 1,
    langfuseEnabled: false,
    disableSecretRedaction: false,
    ...overrides,
  };
}

// ── Mock OrchStoreService ─────────────────────────────────────────────────────

function createMockStore(): jest.Mocked<OrchStoreService> & { db: { project: { upsert: jest.Mock } } } {
  const mockUpsert = jest.fn().mockResolvedValue(undefined);
  return {
    db: {
      project: {
        upsert: mockUpsert,
      },
    },
    // Satisfy OrchStoreService shape without implementing everything
  } as unknown as jest.Mocked<OrchStoreService> & { db: { project: { upsert: jest.Mock } } };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProjectRegistryService', () => {
  let orchHome: string;
  let service: ProjectRegistryService;
  let eventBusService: EventBusService;
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(async () => {
    orchHome = createTempOrchHome();
    // Override ORCH_HOME so service reads from temp dir (I-13)
    process.env['ORCH_HOME'] = orchHome;

    mockStore = createMockStore();
    // Suppress Logger output in test runs
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const emitter = new EventEmitter2({ wildcard: true, maxListeners: 50 });
    eventBusService = new EventBusService(emitter);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectRegistryService,
        { provide: OrchStoreService, useValue: mockStore },
        { provide: EventBusService, useValue: eventBusService },
      ],
    }).compile();

    service = module.get<ProjectRegistryService>(ProjectRegistryService);
    // Note: onModuleInit is NOT called automatically in TestingModule.compile()
    // We call it explicitly where needed.
  });

  afterEach(async () => {
    // Destroy watcher if it was started
    await service.onModuleDestroy();
    // Clean up temp dir
    fs.rmSync(orchHome, { recursive: true, force: true });
    delete process.env['ORCH_HOME'];
    jest.restoreAllMocks();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  describe('happy path — valid yaml loads', () => {
    it('emits project.registered and caches project on reload()', async () => {
      writeYamlProfile(orchHome, 'test-project.yaml', validProfileData());

      const registeredEvents: unknown[] = [];
      eventBusService.on('project.registered', (payload) => registeredEvents.push(payload));

      const result = await service.reload();

      expect(result.added).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(registeredEvents).toHaveLength(1);
      expect((registeredEvents[0] as { project: { projectId: string } }).project.projectId).toBe('test-project');
    });

    it('getProject() returns cached profile after reload()', async () => {
      writeYamlProfile(orchHome, 'test-project.yaml', validProfileData());
      await service.reload();

      const project = await service.getProject('test-project');
      expect(project).toBeDefined();
      expect(project?.projectId).toBe('test-project');
      expect(project?.rootPath).toBe('/tmp/test-project');
    });

    it('listProjects() returns all cached profiles', async () => {
      writeYamlProfile(orchHome, 'proj-a.yaml', validProfileData({ projectId: 'proj-a', rootPath: '/tmp/proj-a' }));
      writeYamlProfile(orchHome, 'proj-b.yaml', validProfileData({ projectId: 'proj-b', rootPath: '/tmp/proj-b' }));

      await service.reload();
      const projects = await service.listProjects();

      expect(projects).toHaveLength(2);
      const ids = projects.map((p) => p.projectId).sort();
      expect(ids).toEqual(['proj-a', 'proj-b']);
    });

    it('upserts to DB on reload()', async () => {
      writeYamlProfile(orchHome, 'test-project.yaml', validProfileData());
      await service.reload();

      expect(mockStore.db.project.upsert).toHaveBeenCalledTimes(1);
      expect(mockStore.db.project.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rootPath: '/tmp/test-project' },
        }),
      );
    });
  });

  // ── Invalid yaml ────────────────────────────────────────────────────────────

  describe('invalid yaml — error handling', () => {
    it('emits project.invalid and captures error but keeps running for valid files', async () => {
      writeYamlProfile(orchHome, 'bad-project.yaml', { rootPath: '/tmp/bad' /* missing required fields */ });
      writeYamlProfile(orchHome, 'good-project.yaml', validProfileData());

      const invalidEvents: unknown[] = [];
      eventBusService.on('project.invalid', (payload) => invalidEvents.push(payload));

      const result = await service.reload();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(ProfileValidationError);
      expect(result.added).toBe(1); // good-project still added
      expect(result.errors[0].code).toBe('PROFILE_VALIDATION_ERROR');

      expect(invalidEvents).toHaveLength(1);
    });

    it('handles malformed YAML gracefully', async () => {
      const badYaml = path.join(orchHome, 'projects', 'broken.yaml');
      fs.writeFileSync(badYaml, '{ unclosed: [', 'utf8');

      const result = await service.reload();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(ProfileValidationError);
    });

    it('service does not crash when all files are invalid', async () => {
      writeYamlProfile(orchHome, 'bad1.yaml', { invalid: true });
      writeYamlProfile(orchHome, 'bad2.yaml', { alsoInvalid: 'yes' });

      await expect(service.reload()).resolves.toBeDefined();
      const result = await service.reload();
      expect(result.errors).toHaveLength(2);
      expect(result.added).toBe(0);
    });
  });

  // ── File change (watcher) ───────────────────────────────────────────────────

  describe('file change — watcher triggers project.updated', () => {
    it('emits project.updated when a loaded yaml is modified', async () => {
      writeYamlProfile(orchHome, 'test-project.yaml', validProfileData());
      await service.reload();

      const updatedEvents: Array<{ project: { projectId: string }; previous: { projectId: string } }> = [];
      eventBusService.on('project.updated', (payload) => updatedEvents.push(payload as { project: { projectId: string }; previous: { projectId: string } }));

      // Write a modified version (different rootPath = content change)
      const modified = validProfileData({ rootPath: '/tmp/test-project-modified' });
      writeYamlProfile(orchHome, 'test-project.yaml', modified);
      await service.reload();

      expect(updatedEvents).toHaveLength(1);
      expect(updatedEvents[0]?.project.projectId).toBe('test-project');
      expect(updatedEvents[0]?.previous.projectId).toBe('test-project');
    });

    it('does not emit project.updated if content is unchanged', async () => {
      writeYamlProfile(orchHome, 'test-project.yaml', validProfileData());
      await service.reload();

      const updatedEvents: unknown[] = [];
      eventBusService.on('project.updated', (payload) => updatedEvents.push(payload));

      // Reload again — no changes on disk
      await service.reload();

      expect(updatedEvents).toHaveLength(0);
    });
  });

  // ── File delete (watcher) ───────────────────────────────────────────────────

  describe('file delete — project.removed emitted', () => {
    it('emits project.removed when a loaded yaml is deleted', async () => {
      const filePath = writeYamlProfile(orchHome, 'test-project.yaml', validProfileData());
      await service.reload();

      const removedEvents: Array<{ projectId: string }> = [];
      eventBusService.on('project.removed', (payload) => removedEvents.push(payload as { projectId: string }));

      // Delete the file and reload
      fs.unlinkSync(filePath);
      const result = await service.reload();

      expect(result.removed).toBe(1);
      expect(removedEvents).toHaveLength(1);
      expect(removedEvents[0]?.projectId).toBe('test-project');
    });

    it('getProject() returns undefined after removal', async () => {
      const filePath = writeYamlProfile(orchHome, 'test-project.yaml', validProfileData());
      await service.reload();

      expect(await service.getProject('test-project')).toBeDefined();

      fs.unlinkSync(filePath);
      await service.reload();

      expect(await service.getProject('test-project')).toBeUndefined();
    });
  });

  // ── reload() counts ─────────────────────────────────────────────────────────

  describe('reload() — returns correct counts', () => {
    it('tracks added, updated, removed in one reload cycle', async () => {
      // Initial load: 2 projects
      writeYamlProfile(orchHome, 'proj-a.yaml', validProfileData({ projectId: 'proj-a', rootPath: '/tmp/proj-a' }));
      writeYamlProfile(orchHome, 'proj-b.yaml', validProfileData({ projectId: 'proj-b', rootPath: '/tmp/proj-b' }));
      const firstResult = await service.reload();
      expect(firstResult.added).toBe(2);
      expect(firstResult.updated).toBe(0);
      expect(firstResult.removed).toBe(0);

      // Modify proj-a, delete proj-b, add proj-c
      writeYamlProfile(orchHome, 'proj-a.yaml', validProfileData({ projectId: 'proj-a', rootPath: '/tmp/proj-a-v2' }));
      fs.unlinkSync(path.join(orchHome, 'projects', 'proj-b.yaml'));
      writeYamlProfile(orchHome, 'proj-c.yaml', validProfileData({ projectId: 'proj-c', rootPath: '/tmp/proj-c' }));

      const secondResult = await service.reload();
      expect(secondResult.added).toBe(1);
      expect(secondResult.updated).toBe(1);
      expect(secondResult.removed).toBe(1);
      expect(secondResult.errors).toHaveLength(0);
    });
  });
});
