/**
 * event-types.spec.ts — Smoke tests for event type definitions.
 *
 * Verifies:
 *  - ALL_EVENT_TYPES is a non-empty readonly array
 *  - Contains all expected Phase 2 event types (exhaustive check)
 *  - No duplicates
 */

import { describe, it, expect } from 'vitest';
import { ALL_EVENT_TYPES } from './event-types.js';
import type { EventType } from './event-types.js';

describe('ALL_EVENT_TYPES', () => {
  it('is non-empty', () => {
    expect(ALL_EVENT_TYPES.length).toBeGreaterThan(0);
  });

  it('contains all expected Phase 2 event types', () => {
    const expected: EventType[] = [
      'session.started',
      'session.state_changed',
      'session.ended',
      'session.rate_limited',
      'session.context_full',
      'queue.enqueued',
      'queue.state_changed',
      'hook.received',
      'operator.action',
      'project.registered',
    ];
    for (const evt of expected) {
      expect(ALL_EVENT_TYPES).toContain(evt);
    }
  });

  it('has no duplicate event types', () => {
    const unique = new Set(ALL_EVENT_TYPES);
    expect(unique.size).toBe(ALL_EVENT_TYPES.length);
  });

  it('contains Phase 3 context budget event types (Task 3.2)', () => {
    // Task 3.2 added session.context_near_limit and session.force_handoff.
    // Task 3.3 added session.handoff_pending. Task 3.6 added session.handoff_prepared
    // and session.handoff_applied. Count updated from 13 to 15.
    expect(ALL_EVENT_TYPES).toContain('session.context_near_limit');
    expect(ALL_EVENT_TYPES).toContain('session.force_handoff');
    expect(ALL_EVENT_TYPES).toContain('session.handoff_pending');
    expect(ALL_EVENT_TYPES).toContain('session.handoff_prepared');
    expect(ALL_EVENT_TYPES).toContain('session.handoff_applied');
    expect(ALL_EVENT_TYPES.length).toBe(15);
  });
});
