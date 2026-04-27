---
spec_id: SPEC-2026-04-24-T2-002
tier: 2
status: approved
version: 1.0
created: 2026-04-24
related_specs: [SPEC-2026-04-24-T1-001, SPEC-2026-04-24-T2-001]
---

# SPEC T2-002: Queue & File Watcher

# PART A — BUSINESS SPECIFICATION

## A.1 Context

The queue is the handoff between human (who prepares plans) and daemon (which executes them). Plans arrive via three channels:

1. **File drop** — human writes markdown plan to `<project>/agent-workspace/session-plans/pending/` (path from profile)
2. **Telegram** — user sends `/queue <plan-content>` or references a file
3. **Webhook** — external system POSTs a plan

All three converge into the same queue table.

## A.2 Business Rules

- **BR-Q1**: FIFO by default. Priority override via frontmatter `priority` field (higher = earlier).
- **BR-Q2**: Per-project serialization. Only one session runs per project at a time (v1).
- **BR-Q3**: Idempotency. Same file picked up twice (e.g., daemon restart) must not duplicate.
- **BR-Q4**: Failed items retry up to 3 times (configurable). After 3 failures: quarantine, human review required.
- **BR-Q5**: Cancelled items stay in queue history (audit trail).
- **BR-Q6**: Plan files in `completed/` folder are archived, not deleted (human's archive).

## A.3 User Story

I write `phase-1-task-3.md` in `session-plans/pending/`. Within 5 seconds, Orch notices, parses the frontmatter, enqueues it. I see it in my Telegram `/queue-list` and in Web UI. When the currently-running session ends, this one auto-starts. On completion, the file moves to `session-plans/completed/` with a success marker in its frontmatter.

---

# PART B — AGENT CONTRACT

## B.1 Plan File Format

Markdown with YAML frontmatter:

```markdown
---
id: T1-3  # stable ID
priority: 5  # default 0
session_type: FOCUSED_IMPL
budget_tokens: 120000
handoff_from: <previous-session-id> # optional
created_by: human  # or "autonomous" if generated
---

# Task: <title>

<plan content in project's own format>
```

Frontmatter validated by zod. Missing `session_type` → error, item rejected with `VALIDATION_FAILED`.

## B.2 File Watcher

Per registered project, watch `<project.path>/<profile.queue.file_watcher.path>`:
- Use `chokidar` with `awaitWriteFinish` (wait 500ms for writes to settle)
- Events: `add`, `change`, `unlink`
- On `add`: parse + validate + enqueue
- On `change`: if status still `pending`, re-parse + update; if `running` or later, ignore
- On `unlink`: if status `pending`, cancel; else ignore

## B.3 Enqueue Flow

```typescript
interface EnqueueInput {
  projectId: string;
  source: 'file' | 'telegram' | 'webhook' | 'api';
  planPath?: string; // for file source
  planContent?: string; // for telegram/webhook
  frontmatter: PlanFrontmatter;
  priority: number; // default 0
}

interface QueueItem {
  id: string; // uuid
  projectId: string;
  planId: string; // from frontmatter
  planPath?: string;
  sessionType: SessionType;
  priority: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'quarantined';
  retryCount: number;
  enqueuedAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  sessionId?: string; // FK to Session
  lastError?: string;
}
```

Idempotency key: `(project_id, plan_id)`. If exists and status in (pending, running): skip. If completed/failed and file mtime newer: allow re-enqueue with retryCount reset.

## B.4 Dequeue (Next)

Transactional SELECT + UPDATE:
```sql
BEGIN;
SELECT * FROM queue_item
  WHERE project_id = ? AND status = 'pending'
  ORDER BY priority DESC, enqueued_at ASC
  LIMIT 1;
-- if found:
UPDATE queue_item SET status = 'running', started_at = NOW()
  WHERE id = ? AND status = 'pending';  -- optimistic lock
COMMIT;
```

## B.5 Completion Flow

On session end event (from SessionController):
- Success → UPDATE status = 'completed', move file to `completed/` with success marker
- Failure → increment retryCount; if < maxRetries, reset to pending after cooldown; else quarantine
- Cancelled → status = 'cancelled', leave file in pending (human decides)

File move semantics:
- `completed/<N>-<slug>.md` where N is zero-padded counter
- Append YAML frontmatter update:
  ```yaml
  completed_at: <iso8601>
  session_id: <id>
  end_reason: <reason>
  tokens_used: <n>
  ```

## B.6 API

### Public (service methods)
- `enqueue(input: EnqueueInput): Promise<QueueItem>`
- `getNext(projectId: string): Promise<QueueItem | null>`
- `markComplete(itemId: string, result: SessionResult): Promise<void>`
- `markFailed(itemId: string, error: string): Promise<void>`
- `cancel(itemId: string, reason: string): Promise<void>`
- `pauseProject(projectId: string): Promise<void>`
- `resumeProject(projectId: string): Promise<void>`
- `list(projectId: string, filter?: ListFilter): Promise<QueueItem[]>`

### Events emitted
- `queue.itemEnqueued(projectId, itemId)`
- `queue.itemStarted(projectId, itemId, sessionId)`
- `queue.itemCompleted(projectId, itemId)`
- `queue.itemFailed(projectId, itemId, error, retryCount)`
- `queue.itemQuarantined(projectId, itemId)`
- `queue.projectPaused(projectId, reason)`
- `queue.projectResumed(projectId)`

## B.7 Concurrency & Atomicity

- All status changes through repository (no raw SQL elsewhere)
- Repository uses transactions for multi-step ops
- SQLite WAL mode
- Serialize writes via in-process mutex per project_id (Prisma + JavaScript lock; SQLite is already single-writer)

## B.8 Retention

- Pending/running items: kept
- Completed: kept indefinitely (audit)
- Failed (non-quarantined): kept 30 days then purged
- Quarantined: kept indefinitely until human acts

## B.9 Validation (at boundary)

Frontmatter fields validated by zod:
```typescript
const planSchema = z.object({
  id: z.string().min(1).max(64),
  priority: z.number().int().default(0),
  session_type: z.enum(['PLAN', 'FOCUSED_IMPL', 'MULTI_TASK_IMPL', 'VERIFY', 'RESEARCH', 'RECOVERY', 'THESIS', 'INGEST', 'POST_MORTEM']),
  budget_tokens: z.number().int().positive().optional(),
  handoff_from: z.string().optional(),
  created_by: z.enum(['human', 'autonomous']).default('human'),
});
```

Note: `session_type` enum is the *union* of all possible project session types. Each profile declares which subset it uses. If type not in project's profile → reject at enqueue time.

## B.10 Tests Required

- Unit: enqueue idempotency
- Unit: priority ordering
- Unit: retry counting + quarantine
- Integration: file watcher debounce
- Integration: rapid consecutive enqueues
- Integration: daemon restart with pending items (recovery)
- Integration: file deleted mid-run
- Integration: multiple projects isolated
