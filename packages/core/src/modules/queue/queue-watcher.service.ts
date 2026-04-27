/**
 * QueueWatcherService — watches `<projectRoot>/session-plans/pending/*.md` for
 * each registered project and calls QueueService.enqueue on file add/change.
 *
 * Design:
 *  - Subscribes to EventBus `project.registered` → start watcher for that project
 *  - Subscribes to EventBus `project.removed` → stop watcher for that project
 *  - Each watcher is scoped to one project's pending directory
 *  - Debounces file events 300ms per-path to handle editor-write bursts
 *  - Reads YAML frontmatter (first 2KB) via inline parser (js-yaml already a dep)
 *  - Computes dedupKey = sha256(absolutePath + ':' + mtime) for deterministic dedup
 *  - On YAML parse failure: warns + emits `queue.invalid-plan` (no throw, no crash)
 *  - On file unlink: NO-op (plans already enqueued persist)
 *
 * I-10: frontmatter parsed via js-yaml then validated before calling enqueue
 * I-11: invalid plan emits event (no silent failure)
 * I-14: no domain-layer imports of this service
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { watch, type FSWatcher } from 'chokidar';
import * as jsYaml from 'js-yaml';
import { EventBusService } from '../events/event-bus.service.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import type { Profile } from '../../domain/profile.js';
import { QueueService } from './queue.service.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PENDING_SUBPATH = path.join('session-plans', 'pending');
const DEBOUNCE_MS = 300;
const FRONTMATTER_READ_BYTES = 2048;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Per-path debounce: returns a function that, when called with a string key,
 * delays `fn(key)` by `ms` ms and cancels any prior pending call for that key.
 */
function makePerPathDebounce(
  fn: (filePath: string) => void,
  ms: number,
): (filePath: string) => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (filePath: string) => {
    const existing = timers.get(filePath);
    if (existing !== undefined) clearTimeout(existing);
    const t = setTimeout(() => {
      timers.delete(filePath);
      fn(filePath);
    }, ms);
    timers.set(filePath, t);
  };
}

/**
 * Compute a deterministic dedup key for a plan file.
 * sha256(absolutePath + ':' + mtime) — new mtime = new entry (re-enqueue).
 */
function computeDedupKey(absolutePath: string, mtime: number): string {
  return crypto
    .createHash('sha256')
    .update(`${absolutePath}:${mtime}`)
    .digest('hex');
}

/**
 * Read the first `maxBytes` of a file and parse YAML frontmatter delimited by `---`.
 *
 * Returns parsed frontmatter object or null if no frontmatter found.
 * Throws on YAML parse errors (caller handles).
 */
function readFrontmatter(filePath: string): Record<string, unknown> | null {
  let head: string;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(FRONTMATTER_READ_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, FRONTMATTER_READ_BYTES, 0);
    fs.closeSync(fd);
    head = buf.slice(0, bytesRead).toString('utf8');
  } catch {
    return null;
  }

  // Expect file to start with `---\n`
  if (!head.startsWith('---')) return null;

  const endMarker = head.indexOf('\n---', 3);
  if (endMarker === -1) return null;

  const yamlBody = head.slice(4, endMarker); // strip leading '---\n'
  const parsed = jsYaml.load(yamlBody);
  if (typeof parsed !== 'object' || parsed === null) return null;
  return parsed as Record<string, unknown>;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class QueueWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWatcherService.name);

  /** Map from projectId → FSWatcher */
  private readonly watchers = new Map<string, FSWatcher>();

  /** Unsubscribe functions for EventBus subscriptions */
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly queueService: QueueService,
    private readonly eventBus: EventBusService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    const unsubRegistered = this.eventBus.on(
      EVENT_CHANNELS.project.registered,
      ({ project }) => {
        void this.startWatcher(project);
      },
    );

    const unsubRemoved = this.eventBus.on(
      EVENT_CHANNELS.project.removed,
      ({ projectId }) => {
        void this.stopWatcher(projectId);
      },
    );

    this.unsubscribers.push(unsubRegistered, unsubRemoved);
    this.logger.log(
      'QueueWatcherService initialised — listening for project events',
    );
  }

  async onModuleDestroy(): Promise<void> {
    // Unsubscribe from EventBus
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;

    // Close all active watchers
    const closePromises = Array.from(this.watchers.entries()).map(
      async ([projectId, watcher]) => {
        await watcher.close();
        this.logger.log(`Watcher closed for project ${projectId}`);
      },
    );
    await Promise.allSettled(closePromises);
    this.watchers.clear();
  }

  // ── Watcher management ─────────────────────────────────────────────────────

  /**
   * Start watching `<projectRoot>/session-plans/pending/*.md` for a project.
   * If a watcher is already running for this project, it is stopped first.
   */
  async startWatcher(project: Profile): Promise<void> {
    const { projectId, rootPath } = project;

    // Stop any existing watcher for this project
    if (this.watchers.has(projectId)) {
      await this.stopWatcher(projectId);
    }

    const pendingDir = path.join(rootPath, PENDING_SUBPATH);

    // Ensure the pending directory exists (create on first registration)
    try {
      fs.mkdirSync(pendingDir, { recursive: true });
    } catch {
      // ignore; directory may already exist
    }

    this.logger.log({
      msg: 'queue-watcher:start',
      projectId,
      pendingDir,
    });

    // Watch the directory (not a glob pattern) — chokidar v5 on Windows requires
    // watching a directory directly; glob patterns are unreliable on Windows.
    // We filter for *.md files in the event handler.
    const watcher = watch(pendingDir, {
      ignoreInitial: false,
      persistent: true,
    });

    const debouncedHandle = makePerPathDebounce((filePath: string) => {
      void this.handleFileEvent(projectId, filePath);
    }, DEBOUNCE_MS);

    // Filter: only process .md files
    const handleIfMd = (filePath: string) => {
      if (filePath.endsWith('.md')) {
        debouncedHandle(filePath);
      }
    };

    watcher
      .on('add', (filePath: string) => handleIfMd(filePath))
      .on('change', (filePath: string) => handleIfMd(filePath))
      .on('unlink', () => {
        // NO-op: plans already enqueued persist (spec §4)
      })
      .on('error', (err: unknown) => {
        this.logger.error({
          msg: 'queue-watcher:error',
          projectId,
          error: String(err),
        });
      });

    this.watchers.set(projectId, watcher);
  }

  /**
   * Stop watching a project's pending directory.
   */
  async stopWatcher(projectId: string): Promise<void> {
    const watcher = this.watchers.get(projectId);
    if (watcher === undefined) return;

    await watcher.close();
    this.watchers.delete(projectId);
    this.logger.log({ msg: 'queue-watcher:stop', projectId });
  }

  // ── File event handling ────────────────────────────────────────────────────

  /**
   * Handle an add or change event for a plan file.
   *
   * 1. Stat the file for mtime
   * 2. Compute dedupKey = sha256(path:mtime)
   * 3. Read + parse YAML frontmatter (first 2KB)
   * 4. Extract priority (default 5) and sessionType
   * 5. Call queueService.enqueue
   *
   * On YAML parse failure: warn + emit queue.invalid-plan, do NOT throw.
   */
  private async handleFileEvent(
    projectId: string,
    filePath: string,
  ): Promise<void> {
    let mtime: number;
    try {
      const stat = fs.statSync(filePath);
      mtime = stat.mtime.getTime();
    } catch (err) {
      this.logger.warn({
        msg: 'queue-watcher:stat-failed',
        projectId,
        filePath,
        error: String(err),
      });
      return;
    }

    const dedupKey = computeDedupKey(filePath, mtime);

    let frontmatter: Record<string, unknown> | null = null;
    try {
      frontmatter = readFrontmatter(filePath);
    } catch (err) {
      // I-11: warn + do not throw (no silent masking; caller sees the log)
      this.logger.warn({
        msg: 'queue-watcher:yaml-parse-failed',
        projectId,
        filePath,
        error: String(err),
      });
      return;
    }

    const priority =
      typeof frontmatter?.['priority'] === 'number'
        ? Math.round(frontmatter['priority'])
        : 5;

    const sessionType =
      typeof frontmatter?.['sessionType'] === 'string'
        ? frontmatter['sessionType']
        : undefined;

    try {
      await this.queueService.enqueue({
        projectId,
        planPath: filePath,
        priority,
        dedupKey,
        mtime,
        sessionType,
        payload: frontmatter ?? {},
      });

      this.logger.debug({
        msg: 'queue-watcher:enqueued',
        projectId,
        filePath,
        dedupKey,
        priority,
      });
    } catch (err) {
      this.logger.error({
        msg: 'queue-watcher:enqueue-failed',
        projectId,
        filePath,
        error: String(err),
      });
    }
  }
}
