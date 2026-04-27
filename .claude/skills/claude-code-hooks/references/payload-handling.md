# Payload Handling: Server-Side Zod Schemas, Dedup, and Idempotency

## Zod Payload Schemas

```typescript
import { z } from 'zod';

const sessionStartPayload = z.object({
  session_id: z.string(),
  cwd: z.string().optional(),
  ts: z.string().datetime().optional(),
  resumed: z.boolean().optional(),
});

const sessionEndPayload = z.object({
  session_id: z.string(),
  ts: z.string().datetime().optional(),
});

const stopPayload = z.object({
  session_id: z.string(),
  ts: z.string().datetime().optional(),
});

const subagentStopPayload = z.object({
  session_id: z.string(),
  ts: z.string().datetime().optional(),
});
```

## HooksController

```typescript
@Controller('/projects/:projectId/hooks')
@UseGuards(BearerAuthGuard)
export class HooksController {
  constructor(
    private events: EventBus,
    private dedup: DedupService,
    private hookRepo: HookEventRepository,
  ) {}

  @Post('session-start')
  async sessionStart(
    @Param('projectId') projectId: string,
    @Body() rawBody: unknown,
  ) {
    const payload = sessionStartPayload.parse(rawBody);
    const dedupKey = `${payload.session_id}|session-start|${Math.floor(Date.parse(payload.ts ?? '') / 1000)}`;

    if (this.dedup.isDup(dedupKey)) {
      return { ok: true, deduped: true };
    }

    const event = await this.hookRepo.insert({
      sessionId: payload.session_id,
      hookType: 'session-start',
      payload: rawBody,
      dedupKey,
    });

    this.events.emit('hook.sessionStart', { projectId, sessionId: payload.session_id, event });

    return { ok: true, event_id: event.id, received_at: new Date().toISOString() };
  }
  // similar for other hook types
}
```

## Dedup Strategy

- Key = `{session_id}|{hook_type}|{ts_floored_to_second}`
- DedupService uses in-memory LRU (TTL 5min) — hooks should not re-fire within that window
- On restart, dedup cache resets — idempotency guaranteed only within process lifetime
- For critical hooks (SessionEnd) persist dedup key in DB

## Security

- Bearer token required (same as admin API token)
- Rate limit (60/min/project, per hooks-receiver SPEC)
- CORS disabled (these are not browser calls)
- Bind to 127.0.0.1 (Invariant I-7)

## Summary Flow

```
Human triggers Claude Code
  |
  v
Claude Code runs hooks at each lifecycle point
  |
  v
Hook executes curl localhost:3737/projects/X/hooks/Y
  |
  v
Orch validates (auth, project, payload)
  |
  v
Dedups by (session_id + hook_type + ts)
  |
  v
Persists in HookEvent table
  |
  v
Emits EventBus event
  |
  v
Subscribers: SessionController updates state, TracingService adds span event,
             NotificationService may alert user
```
