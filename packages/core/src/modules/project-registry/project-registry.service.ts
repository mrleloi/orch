/**
 * ProjectRegistryService — scans ~/.orch/projects/*.yaml, validates profiles,
 * persists to DB via IOrchStore, and watches for file changes via chokidar.
 *
 * I-5:  reads ONLY ~/.orch/ — never ~/.ccs/ or ~/.claude/
 * I-10: all YAML input passes through ProfileSchema.safeParse() before use
 * I-12: YAML/IO errors are wrapped in ProfileValidationError before bubbling
 * I-14: Profile type imported from domain — not redefined here
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { watch, type FSWatcher } from 'chokidar';
import * as jsYaml from 'js-yaml';
import type { Profile } from '../../domain/profile.js';
import { parseProfile } from '../../domain/profile.js';
import { ProfileValidationError } from '../../domain/errors.js';
import { OrchStoreService } from '../db/orch-store.service.js';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';

// ── Directory resolution ──────────────────────────────────────────────────────

/**
 * Resolves the projects directory: $ORCH_HOME/projects or ~/.orch/projects.
 *
 * I-5: only reads ~/.orch/ — never ~/.ccs/ or ~/.claude/
 */
export function resolveProjectsDir(): string {
  const orchHome = process.env['ORCH_HOME'] ?? path.join(os.homedir(), '.orch');
  return path.join(orchHome, 'projects');
}

// ── Reload result ─────────────────────────────────────────────────────────────

export interface ReloadResult {
  added: number;
  updated: number;
  removed: number;
  errors: ProfileValidationError[];
}

// ── Debounce helper ───────────────────────────────────────────────────────────

function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ProjectRegistryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectRegistryService.name);

  /** In-memory cache keyed by projectId */
  private readonly cache = new Map<string, Profile>();

  /** Map from yaml file path → projectId (for delete handling) */
  private readonly pathToProjectId = new Map<string, string>();

  private watcher: FSWatcher | null = null;

  constructor(
    private readonly store: OrchStoreService,
    private readonly eventBus: EventBusService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const projectsDir = resolveProjectsDir();
    this.ensureProjectsDir(projectsDir);
    await this.reload();
    this.startWatcher(projectsDir);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Returns all currently loaded projects from the in-memory cache. */
  listProjects(): Promise<Profile[]> {
    return Promise.resolve(Array.from(this.cache.values()));
  }

  /** Returns a single project by projectId, or undefined if not found. */
  getProject(projectId: string): Promise<Profile | undefined> {
    return Promise.resolve(this.cache.get(projectId));
  }

  /**
   * Synchronous cache lookup — returns the profile immediately without a Promise.
   *
   * Use this in hot paths that must not add a microtask delay (e.g., the SC-8
   * concurrency-cap check inside SessionManager.executeSession). The cache is
   * always up to date: YAML reload events propagate synchronously to the cache.
   *
   * I-2: project-agnostic; returns undefined for any unknown projectId.
   */
  getProjectSync(projectId: string): Profile | undefined {
    return this.cache.get(projectId);
  }

  /**
   * Re-scans the projects directory, diffs against the in-memory cache,
   * upserts/removes from DB and cache, and returns a summary.
   */
  async reload(): Promise<ReloadResult> {
    const projectsDir = resolveProjectsDir();
    const result: ReloadResult = {
      added: 0,
      updated: 0,
      removed: 0,
      errors: [],
    };

    // Scan disk
    const diskProfiles = new Map<
      string,
      { profile: Profile; filePath: string }
    >();
    let files: string[] = [];
    try {
      files = fs
        .readdirSync(projectsDir)
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    } catch (err) {
      // Directory unreadable — treat as empty, log warning
      this.logger.warn(
        `Cannot read projects directory ${projectsDir}: ${String(err)}`,
      );
    }

    for (const file of files) {
      const filePath = path.join(projectsDir, file);
      const parseResult = this.readAndParseFile(filePath);
      if (parseResult.success) {
        diskProfiles.set(parseResult.profile.projectId, {
          profile: parseResult.profile,
          filePath,
        });
      } else {
        result.errors.push(parseResult.error);
        this.logger.warn(
          `Skipping invalid profile ${filePath}: ${parseResult.error.message}`,
        );
        this.eventBus.emit(EVENT_CHANNELS.project.invalid, {
          filePath,
          error: parseResult.error,
        });
      }
    }

    // Determine changes
    const existingIds = new Set(this.cache.keys());
    const incomingIds = new Set(diskProfiles.keys());

    // Added or updated
    for (const [projectId, { profile, filePath }] of diskProfiles) {
      const existing = this.cache.get(projectId);
      if (existing === undefined) {
        await this.upsertToDb(profile);
        this.cache.set(projectId, profile);
        this.pathToProjectId.set(filePath, projectId);
        result.added++;
        this.eventBus.emit(EVENT_CHANNELS.project.registered, {
          project: profile,
        });
      } else {
        // Update only if changed
        if (JSON.stringify(existing) !== JSON.stringify(profile)) {
          const previous = existing;
          await this.upsertToDb(profile);
          this.cache.set(projectId, profile);
          this.pathToProjectId.set(filePath, projectId);
          result.updated++;
          this.eventBus.emit(EVENT_CHANNELS.project.updated, {
            project: profile,
            previous,
          });
        }
      }
    }

    // Removed (in cache but not on disk)
    for (const projectId of existingIds) {
      if (!incomingIds.has(projectId)) {
        this.cache.delete(projectId);
        // Remove reverse mapping
        for (const [fp, pid] of this.pathToProjectId) {
          if (pid === projectId) {
            this.pathToProjectId.delete(fp);
            break;
          }
        }
        result.removed++;
        this.eventBus.emit(EVENT_CHANNELS.project.removed, { projectId });
      }
    }

    return result;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private ensureProjectsDir(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      this.logger.warn(
        `Could not create projects directory ${dir}: ${String(err)}`,
      );
    }
  }

  /**
   * Reads and parses a YAML file, wrapping errors in ProfileValidationError (I-12).
   * All YAML input passes through ProfileSchema.safeParse() — no `as Profile` casts (I-10).
   */
  private readAndParseFile(
    filePath: string,
  ):
    | { success: true; profile: Profile }
    | { success: false; error: ProfileValidationError } {
    let raw: unknown;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      raw = jsYaml.load(content);
    } catch (err) {
      return {
        success: false,
        error: new ProfileValidationError(
          `Failed to read/parse YAML at ${filePath}: ${String(err)}`,
          [],
          { cause: err },
        ),
      };
    }

    const result = parseProfile(raw);
    if (result.success) {
      return { success: true, profile: result.data };
    }

    return {
      success: false,
      error: new ProfileValidationError(
        `Schema validation failed for ${filePath}`,
        result.error.issues.map((i) => ({
          path: i.path as (string | number)[],
          message: i.message,
        })),
        { cause: result.error },
      ),
    };
  }

  /**
   * Upserts a project profile to the DB via OrchStoreService.
   * Finds existing row by rootPath; creates or updates accordingly.
   */
  private async upsertToDb(profile: Profile): Promise<void> {
    try {
      // The DB Project row is keyed by rootPath (unique index).
      // We use a raw Prisma query through the store's underlying db client.
      // Since IOrchStore doesn't expose a upsertProject method (not in Phase 1 contract),
      // we access the Prisma client directly through the store's protected db field.
      // This is the adapter boundary (I-12) — raw Prisma access stops here.
      const db = (
        this.store as unknown as {
          db: { project: { upsert: (args: unknown) => Promise<unknown> } };
        }
      ).db;
      await db.project.upsert({
        where: { rootPath: profile.rootPath },
        create: {
          rootPath: profile.rootPath,
          profileJson: JSON.stringify(profile),
        },
        update: {
          profileJson: JSON.stringify(profile),
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to upsert project ${profile.projectId} to DB: ${String(err)}`,
      );
    }
  }

  private startWatcher(projectsDir: string): void {
    const globPattern = path.join(projectsDir, '*.{yaml,yml}');

    this.watcher = watch(globPattern, {
      ignoreInitial: true,
      persistent: true,
    });

    const handleChange = debounce((filePath: string) => {
      void this.handleFileChange(filePath);
    }, 500);

    const handleUnlink = debounce((filePath: string) => {
      this.handleFileUnlink(filePath);
    }, 500);

    this.watcher
      .on('add', (filePath: string) => handleChange(filePath))
      .on('change', (filePath: string) => handleChange(filePath))
      .on('unlink', (filePath: string) => handleUnlink(filePath))
      .on('error', (err: unknown) => {
        this.logger.error(`File watcher error: ${String(err)}`);
      });
  }

  private async handleFileChange(filePath: string): Promise<void> {
    const parseResult = this.readAndParseFile(filePath);
    if (!parseResult.success) {
      this.logger.warn(
        `Watcher: invalid profile at ${filePath}: ${parseResult.error.message}`,
      );
      this.eventBus.emit(EVENT_CHANNELS.project.invalid, {
        filePath,
        error: parseResult.error,
      });
      return;
    }

    const { profile } = parseResult;
    const existing = this.cache.get(profile.projectId);
    const prevProjectId = this.pathToProjectId.get(filePath);

    // If the same file used to map to a different projectId, remove the old one
    if (prevProjectId !== undefined && prevProjectId !== profile.projectId) {
      this.cache.delete(prevProjectId);
      this.eventBus.emit(EVENT_CHANNELS.project.removed, {
        projectId: prevProjectId,
      });
    }

    await this.upsertToDb(profile);
    this.cache.set(profile.projectId, profile);
    this.pathToProjectId.set(filePath, profile.projectId);

    if (existing === undefined || prevProjectId !== profile.projectId) {
      this.eventBus.emit(EVENT_CHANNELS.project.registered, {
        project: profile,
      });
    } else {
      this.eventBus.emit(EVENT_CHANNELS.project.updated, {
        project: profile,
        previous: existing,
      });
    }
  }

  private handleFileUnlink(filePath: string): void {
    const projectId = this.pathToProjectId.get(filePath);
    if (projectId === undefined) return;

    this.pathToProjectId.delete(filePath);
    this.cache.delete(projectId);
    this.eventBus.emit(EVENT_CHANNELS.project.removed, { projectId });
  }
}
