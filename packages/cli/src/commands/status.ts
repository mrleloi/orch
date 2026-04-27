/**
 * status.ts — `orch status`
 *
 * Fetches state from the daemon:
 *   GET /api/v1/projects
 *   GET /api/v1/sessions/active
 *   GET /api/v1/queue
 *
 * Pretty-prints counts + recent items as plain text tables.
 * No heavy table libraries — simple string formatting only.
 *
 * On ECONNREFUSED → prints "daemon not running" + exits 1.
 */

import { z } from 'zod';
import { httpGet, DaemonNotRunningError } from '../lib/http-client.js';

// ── Response schemas (zod) ─────────────────────────────────────────────────────

const ProfileSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  projectPath: z.string().optional(),
});

const ProjectsResponseSchema = z.object({
  projects: z.array(ProfileSchema),
});

const SessionSchema = z.object({
  sessionId: z.string(),
  projectId: z.string().optional(),
  state: z.string().optional(),
  startedAt: z.string().or(z.number()).optional(),
});

const ActiveSessionsResponseSchema = z.object({
  sessions: z.array(SessionSchema),
});

const QueueItemSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  state: z.string().optional(),
  planPath: z.string().optional(),
  priority: z.number().optional(),
});

const QueueResponseSchema = z.object({
  items: z.array(QueueItemSchema),
});

// ── Formatting helpers ─────────────────────────────────────────────────────────

function pad(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function formatProjects(
  projects: z.infer<typeof ProjectsResponseSchema>['projects'],
): string {
  if (projects.length === 0) return '  (no registered projects)';
  const lines: string[] = [];
  lines.push(`  ${pad('ID', 36)} ${pad('NAME', 24)} PATH`);
  lines.push(`  ${'-'.repeat(36)} ${'-'.repeat(24)} ${'-'.repeat(40)}`);
  for (const p of projects) {
    const id = p.id ?? '-';
    const name = p.name ?? '-';
    const projectPath = p.projectPath ?? '-';
    lines.push(`  ${pad(id, 36)} ${pad(name, 24)} ${projectPath}`);
  }
  return lines.join('\n');
}

function formatSessions(
  sessions: z.infer<typeof ActiveSessionsResponseSchema>['sessions'],
): string {
  if (sessions.length === 0) return '  (no active sessions)';
  const lines: string[] = [];
  lines.push(`  ${pad('SESSION ID', 36)} ${pad('PROJECT', 24)} STATE`);
  lines.push(`  ${'-'.repeat(36)} ${'-'.repeat(24)} ${'-'.repeat(16)}`);
  for (const s of sessions) {
    const sid = s.sessionId ?? '-';
    const proj = s.projectId ?? '-';
    const state = s.state ?? '-';
    lines.push(`  ${pad(sid, 36)} ${pad(proj, 24)} ${state}`);
  }
  return lines.join('\n');
}

function formatQueue(
  items: z.infer<typeof QueueResponseSchema>['items'],
): string {
  if (items.length === 0) return '  (queue empty)';
  const lines: string[] = [];
  lines.push(`  ${pad('ID', 36)} ${pad('PROJECT', 24)} ${pad('STATE', 12)} PLAN`);
  lines.push(`  ${'-'.repeat(36)} ${'-'.repeat(24)} ${'-'.repeat(12)} ${'-'.repeat(40)}`);
  for (const item of items.slice(0, 20)) {
    const id = item.id ?? '-';
    const proj = item.projectId ?? '-';
    const state = item.state ?? '-';
    const plan = item.planPath ?? '-';
    lines.push(`  ${pad(id, 36)} ${pad(proj, 24)} ${pad(state, 12)} ${plan}`);
  }
  if (items.length > 20) {
    lines.push(`  ... and ${items.length - 20} more`);
  }
  return lines.join('\n');
}

// ── Main command ───────────────────────────────────────────────────────────────

export async function runStatus(): Promise<void> {
  let projects: z.infer<typeof ProjectsResponseSchema>['projects'];
  let sessions: z.infer<typeof ActiveSessionsResponseSchema>['sessions'];
  let queueItems: z.infer<typeof QueueResponseSchema>['items'];

  try {
    const [projectsRes, sessionsRes, queueRes] = await Promise.all([
      httpGet('/api/v1/projects', ProjectsResponseSchema),
      httpGet('/api/v1/sessions/active', ActiveSessionsResponseSchema),
      httpGet('/api/v1/queue', QueueResponseSchema),
    ]);
    projects = projectsRes.projects;
    sessions = sessionsRes.sessions;
    queueItems = queueRes.items;
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error('daemon not running');
      process.exit(1);
    }
    throw err;
  }

  console.log('Orch Daemon Status');
  console.log('==================\n');

  console.log(`Projects (${projects.length}):`);
  console.log(formatProjects(projects));

  console.log(`\nActive Sessions (${sessions.length}):`);
  console.log(formatSessions(sessions));

  console.log(`\nQueue Items (${queueItems.length}):`);
  console.log(formatQueue(queueItems));
}
