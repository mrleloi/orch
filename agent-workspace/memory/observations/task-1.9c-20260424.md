# Task 1.9c — AgentWatchdog

## Status
DONE

## Files Changed
- packages/core/src/domain/watchdog/decide-action.ts (created)
- packages/core/src/domain/watchdog/decide-action.spec.ts (created)
- packages/core/src/domain/watchdog/index.ts (created)
- packages/core/src/domain/ports/session-terminator.port.ts (created)
- packages/core/src/domain/ports/session-registry.port.ts (created)
- packages/core/src/domain/ports/index.ts (created)
- packages/core/src/modules/sessions/agent-watchdog.ts (created)
- packages/core/src/modules/sessions/agent-watchdog.spec.ts (created)
- packages/core/src/modules/sessions/sessions.module.ts (modified: +AgentWatchdog, +port token exports)
- packages/core/src/modules/events/event-channels.ts (modified: +session.warned, +session.killed channels + payloads)

## Tests Added
- decide-action.spec.ts: 20 cases (table-driven 14 + boundary 6)
- agent-watchdog.spec.ts: 17 cases across 4 describe blocks
- Total new: 37 tests
- Total passing: 431/431 (was 394)

## Gates
- typecheck: PASS
- lint: PASS (pre-existing warning in main.ts only — not in new files)
- test: PASS (431/431)
- invariants:
  - I-14 domain/watchdog @nestjs actual imports: PASS (grep ^import.*@nestjs returns empty)
  - I-3 sessions/ agent-sdk: PASS (grep returns empty)
  - I-11: PASS (session.warned + session.killed emitted for all non-ok actions)
  - I-1: PASS (decideAction is pure deterministic function, zero LLM)
  - I-13: PASS (tests use jest.useFakeTimers() + jest.setSystemTime(); pure function tests inject `now` directly)

## Deviations from Plan
- Plan spec says `session.startedAt: number` — implemented as epoch ms per spec. Domain Session entity uses Date objects, so WatchdogSession deliberately uses number (epoch ms) in the watchdog-specific view type. This avoids a type mismatch and keeps the pure function free of Date arithmetic.
- `WatchdogSession` is defined in `decide-action.ts` and re-exported from `domain/watchdog/index.ts` rather than being a separate file — this is simpler and keeps the pure function and its input type co-located.
- AgentWatchdog constructor takes `options: WatchdogOptions = {}` as 4th non-injected param. This follows the same pattern as claudegram's watchdog and is the established way to pass configuration to NestJS services without a full ConfigModule. SessionManager (1.9d) will instantiate AgentWatchdog via the module with a concrete options object.

## Concerns
None.

## Assumptions Made
1. WatchdogSession.startedAt is epoch ms (number), not Date — consistent with inject-now testability.
2. AgentWatchdog options object is the 4th constructor parameter (non-injected). This is fine for testing (instantiate directly) but 1.9d needs to register the provider with a factory that supplies the options.
3. session.warned and session.killed payloads use `{ sessionId, reason }` (string IDs) not the full Session entity — keeps the watchdog decoupled from the full session store.
4. The `options` parameter defaults to `{}` when the provider is registered without custom config — uses all DEFAULT_* constants.

## Ports Defined for 1.9d
- `ISessionRegistry` + `SESSION_REGISTRY` token — `packages/core/src/domain/ports/session-registry.port.ts`
- `ISessionTerminator` + `SESSION_TERMINATOR` token — `packages/core/src/domain/ports/session-terminator.port.ts`

## Open Questions for 1.9d
1. SessionManager must register two providers: `{ provide: SESSION_REGISTRY, useExisting: SessionManager }` and `{ provide: SESSION_TERMINATOR, useExisting: SessionManager }`. SessionManager needs to implement both ISessionRegistry and ISessionTerminator interfaces.
2. AgentWatchdog needs WatchdogOptions passed at module construction time. 1.9d should use `{ provide: AgentWatchdog, useFactory: (registry, terminator, eventBus) => new AgentWatchdog(registry, terminator, eventBus, { heartbeatTimeoutMs: ..., ... }), inject: [SESSION_REGISTRY, SESSION_TERMINATOR, EventBusService] }`.
3. SessionManager.getActive() must return WatchdogSession[] shape (not full Session entities) — or it can map internally since WatchdogSession is a narrow subset of Session.

## Notes for spec-compliance-reviewer
- The pure function's decision tree follows exact precedence from spec: ceiling > null-heartbeat-timeout > stuck-after-warn > heartbeat-timeout > ok. All 5 branches tested.
- Boundary semantics: all thresholds use strict `>` (not `>=`) — boundary value AT the threshold is `ok`, 1ms past is the action. Tests cover all 3 boundary transitions.
- Event order: `session.killed` is emitted BEFORE `terminator.terminate()` is called (I-11 — observers see the event even if terminate throws). Covered by test "event emission order".
- Error swallowing: per-session terminate errors are caught/logged; the loop continues. Covered by "error isolation" tests including multi-session scenario.
