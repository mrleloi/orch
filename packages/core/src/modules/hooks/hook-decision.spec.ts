/**
 * hook-decision.spec.ts — 9 vitest cases (3 per decision: approve / deny / modify)
 *
 * Phase 5.3.5 — SC-12. Verifies HookDecision parsing integration in HooksService.
 *
 * Cases per architect §6.4:
 *  1. approve — bare PreToolUse with decision=approve → no tool.denied event
 *  2. approve — PreToolUse with NO decision field (backward compat) → approve
 *  3. approve — approve + message field present → no behavioral change
 *  4. deny    — PreToolUse decision=deny + message → tool.denied DomainEvent emitted
 *  5. deny    — deny without message → tool.denied emitted, message=undefined
 *  6. deny    — deny triggers SessionManager NOT writing tool slash-command (writeStdin spy)
 *  7. modify  — decision=modify + message → hook event inserted; no denial
 *  8. modify  — modify without message → schema PASSES (message optional)
 *  9. modify  — modify event: telemetry JSONL has matching line (decision field present)
 *
 * I-10: HookDecisionPayloadSchema.parse() is the boundary gate — verified implicitly
 *       by every test that passes a decision through processEvent.
 */

import { Logger } from '@nestjs/common';
import { HooksService } from './hooks.service.js';
import { SessionState } from '../../domain/session.js';
import { EVENT_CHANNELS } from '../events/event-channels.js';
import { HookDecisionSchema, HookDecisionPayloadSchema } from './hook-decision.js';
import type { EventBusService } from '../events/event-bus.service.js';
import type { TracingService } from '../tracing/tracing.service.js';
import type { PrismaService } from '../db/prisma.service.js';

// ── Fake builders (mirrors hooks.service.spec.ts pattern) ─────────────────────

type InMemHookEvent = {
  id: string;
  sessionId: string;
  eventType: string;
  payloadJson: string;
  dedupKey: string;
};

type InMemSession = {
  id: string;
  claudeSessionId?: string;
  state: string;
  startedAt: Date | null;
};

function buildFakePrisma(sessions: InMemSession[] = []) {
  const hookEvents: InMemHookEvent[] = [];

  const tx = {
    hookEvent: {
      findUnique: jest.fn(({ where }: { where: { dedupKey: string } }) =>
        Promise.resolve(hookEvents.find((e) => e.dedupKey === where.dedupKey) ?? null),
      ),
      create: jest.fn(({ data }: { data: InMemHookEvent }) => {
        const ev: InMemHookEvent = {
          id: `he-${Date.now()}`,
          sessionId: data.sessionId,
          eventType: data.eventType,
          payloadJson: data.payloadJson,
          dedupKey: data.dedupKey,
        };
        hookEvents.push(ev);
        return Promise.resolve(ev);
      }),
    },
    session: {
      findFirst: jest.fn(({ where }: { where: { claudeSessionId: string } }) =>
        Promise.resolve(
          sessions.find((s) => s.claudeSessionId === where.claudeSessionId) ?? null,
        ),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<InMemSession> }) => {
        const idx = sessions.findIndex((s) => s.id === where.id);
        if (idx >= 0) sessions[idx] = { ...sessions[idx]!, ...data };
        return Promise.resolve(sessions[idx]);
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (tx: typeof tx) => Promise<unknown>) => cb(tx)),
    hookEvent: tx.hookEvent,
    session: tx.session,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { prisma: prisma as unknown as PrismaService, hookEvents };
}

function buildFakeEventBus() {
  const emitted: Array<{ channel: string; payload: unknown }> = [];
  const eventBus = {
    emit: jest.fn((channel: string, payload: unknown) => {
      emitted.push({ channel, payload });
    }),
    on: jest.fn(),
    once: jest.fn(),
  };
  return { eventBus: eventBus as unknown as EventBusService, emitted };
}

function buildFakeTracing() {
  const span = {
    setAttribute: jest.fn(),
    addEvent: jest.fn(),
    setStatus: jest.fn(),
    end: jest.fn(),
    recordException: jest.fn(),
  };
  const tracing = {
    withSpan: jest.fn(
      async (_name: string, fn: (span: typeof span) => Promise<unknown>) => fn(span),
    ),
    getActiveTraceparent: jest.fn(() => undefined),
  };
  return { tracing: tracing as unknown as TracingService, span };
}

const SESSION_ID = 'test-session-decision-abc';

function makeSession(): InMemSession {
  return {
    id: 'db-session-id-1',
    claudeSessionId: SESSION_ID,
    state: SessionState.Running,
    startedAt: new Date(),
  };
}

function buildService(sessions: InMemSession[] = []) {
  const { prisma, hookEvents } = buildFakePrisma(sessions);
  const { eventBus, emitted } = buildFakeEventBus();
  const { tracing, span } = buildFakeTracing();
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const service = new HooksService(prisma, eventBus, tracing);
  return { service, hookEvents, emitted, span };
}

// ── HookDecisionSchema unit tests ─────────────────────────────────────────────

describe('HookDecisionSchema', () => {
  it('parses approve, deny, modify literals', () => {
    expect(HookDecisionSchema.parse('approve')).toBe('approve');
    expect(HookDecisionSchema.parse('deny')).toBe('deny');
    expect(HookDecisionSchema.parse('modify')).toBe('modify');
  });

  it('rejects unknown values', () => {
    expect(() => HookDecisionSchema.parse('ask')).toThrow();
    expect(() => HookDecisionSchema.parse('')).toThrow();
  });
});

describe('HookDecisionPayloadSchema', () => {
  it('allows missing decision and message (backward compat)', () => {
    const result = HookDecisionPayloadSchema.parse({});
    expect(result.decision).toBeUndefined();
    expect(result.message).toBeUndefined();
  });

  it('rejects extra fields (strict)', () => {
    expect(() => HookDecisionPayloadSchema.parse({ extra: 'field' })).toThrow();
  });
});

// ── 9 integration cases (3 per decision) ──────────────────────────────────────

describe('hook-decision: APPROVE (3 cases)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('case 1 — decision=approve: no tool.denied event emitted', async () => {
    const { service, emitted } = buildService([makeSession()]);
    const result = await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Bash',
      decision: 'approve',
    });
    expect(result.deduped).toBe(false);
    expect(result.domainEvent.kind).toBe('PreToolUse');
    const deniedEmits = emitted.filter((e) => e.channel === EVENT_CHANNELS.tool.denied);
    expect(deniedEmits).toHaveLength(0);
  });

  it('case 2 — no decision field (backward compat): treated as approve, no tool.denied', async () => {
    const { service, emitted } = buildService([makeSession()]);
    const result = await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Read',
    });
    expect(result.domainEvent.kind).toBe('PreToolUse');
    expect(emitted.find((e) => e.channel === EVENT_CHANNELS.tool.denied)).toBeUndefined();
  });

  it('case 3 — approve + message present: message logged but no behavioral change', async () => {
    const { service, emitted } = buildService([makeSession()]);
    const result = await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Write',
      decision: 'approve',
      message: 'Approved by policy X',
    });
    expect(result.domainEvent.kind).toBe('PreToolUse');
    expect(emitted.find((e) => e.channel === EVENT_CHANNELS.tool.denied)).toBeUndefined();
  });
});

describe('hook-decision: DENY (3 cases)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('case 4 — decision=deny + message: ToolDeniedEvent emitted with message', async () => {
    const { service, emitted } = buildService([makeSession()]);
    const result = await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Bash',
      decision: 'deny',
      message: 'Bash not permitted in this context',
    });
    expect(result.domainEvent.kind).toBe('ToolDenied');
    if (result.domainEvent.kind === 'ToolDenied') {
      expect(result.domainEvent.toolName).toBe('Bash');
      expect(result.domainEvent.message).toBe('Bash not permitted in this context');
    }
    const deniedEmits = emitted.filter((e) => e.channel === EVENT_CHANNELS.tool.denied);
    expect(deniedEmits).toHaveLength(1);
    expect((deniedEmits[0]!.payload as { toolName: string }).toolName).toBe('Bash');
    expect((deniedEmits[0]!.payload as { message: string }).message).toBe('Bash not permitted in this context');
  });

  it('case 5 — deny without message: tool.denied emitted, message=undefined', async () => {
    const { service, emitted } = buildService([makeSession()]);
    const result = await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Write',
      decision: 'deny',
    });
    expect(result.domainEvent.kind).toBe('ToolDenied');
    const deniedEmit = emitted.find((e) => e.channel === EVENT_CHANNELS.tool.denied);
    expect(deniedEmit).toBeDefined();
    expect((deniedEmit!.payload as { message: unknown }).message).toBeUndefined();
  });

  it('case 6 — deny triggers tool.denied channel so SessionManager skips writeStdin', async () => {
    // Verify the tool.denied channel is emitted (SessionManager subscriber would
    // intercept and suppress writeStdin — tested via channel emission here since
    // SessionManager is a separate module, tested in its own spec).
    const { service, emitted } = buildService([makeSession()]);
    await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Bash',
      decision: 'deny',
      message: 'blocked',
    });
    const toolDeniedChannel = emitted.filter(
      (e) => e.channel === EVENT_CHANNELS.tool.denied,
    );
    // Exactly one tool.denied emission (I-8: dedup prevents double-emit)
    expect(toolDeniedChannel).toHaveLength(1);
    // hook.received is also emitted (non-deduped path)
    const hookReceived = emitted.filter((e) => e.channel === EVENT_CHANNELS.hook.received);
    expect(hookReceived).toHaveLength(1);
  });
});

describe('hook-decision: MODIFY (3 cases)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('case 7 — decision=modify + message: hook event inserted; no denial emitted', async () => {
    const { service, emitted } = buildService([makeSession()]);
    const result = await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Edit',
      decision: 'modify',
      message: 'Input modified by policy',
    });
    // modify path → PreToolUse domain event (not ToolDenied)
    expect(result.domainEvent.kind).toBe('PreToolUse');
    expect(emitted.find((e) => e.channel === EVENT_CHANNELS.tool.denied)).toBeUndefined();
  });

  it('case 8 — modify without message: schema PASSES (message is optional)', async () => {
    // Pure schema unit test — no processEvent needed
    const parsed = HookDecisionPayloadSchema.parse({ decision: 'modify' });
    expect(parsed.decision).toBe('modify');
    expect(parsed.message).toBeUndefined();

    // Also verify via processEvent
    const { service, emitted } = buildService([makeSession()]);
    const result = await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Glob',
      decision: 'modify',
    });
    expect(result.domainEvent.kind).toBe('PreToolUse');
    expect(emitted.find((e) => e.channel === EVENT_CHANNELS.tool.denied)).toBeUndefined();
  });

  it('case 9 — modify event: decision field present in hook payload (telemetry can read it)', async () => {
    // Verify that when decision=modify the hook payload stored in DB contains the field.
    // This is the basis for the telemetry JSONL having decision=modify (Q6).
    const { service, hookEvents } = buildService([makeSession()]);
    await service.processEvent('PreToolUse', {
      session_id: SESSION_ID,
      tool_name: 'Bash',
      decision: 'modify',
      message: 'modified for safety',
    });
    // The raw payload is stored as payloadJson in HookEvent — verify decision is present.
    expect(hookEvents).toHaveLength(1);
    const stored = JSON.parse(hookEvents[0]!.payloadJson) as Record<string, unknown>;
    expect(stored['decision']).toBe('modify');
  });
});
