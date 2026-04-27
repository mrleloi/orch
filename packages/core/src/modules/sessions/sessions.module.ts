/**
 * SessionsModule — NestJS module for Claude Code session lifecycle management.
 *
 * Providers registered:
 *  - Task 1.9a: ClaudeCodeAdapter bound to IAGENT_RUNTIME token (adapter pattern)
 *  - Task 1.9b: RequestQueue (per-session FIFO serialization)
 *  - Task 1.9c: AgentWatchdog (stuck-session detection + termination)
 *  - Task 1.9d: SessionManager (orchestrator — provides SESSION_TERMINATOR + SESSION_REGISTRY)
 *
 * IAGENT_RUNTIME token: decouples SessionManager from the concrete ClaudeCodeAdapter
 * class. SessionManager injects IAgentRuntime via @Inject(IAGENT_RUNTIME) — it never
 * imports the concrete class directly. Tests override via overrideProvider(IAGENT_RUNTIME).
 *
 * AgentWatchdog depends on SESSION_REGISTRY and SESSION_TERMINATOR.
 * Both are satisfied here via `useExisting: SessionManager`.
 *
 * EventsModule is @Global so EventBusService is available without explicit import.
 * We import it here anyway for documentation and to make the dependency graph
 * explicit for future readers.
 *
 * TracingModule is @Global so TracingService is available to ClaudeCodeAdapter
 * without a separate import.
 *
 * DbModule provides OrchStoreService (IOrchStore) used by SessionManager.
 *
 * I-14: Domain types live in domain/; only concrete service classes live here.
 * I-3:  ClaudeCodeAdapter uses CLI subprocess only. No Agent SDK.
 */

import { Module } from '@nestjs/common';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { RequestQueue } from './request-queue.js';
import { AgentWatchdog } from './agent-watchdog.js';
import { SessionManager } from './session-manager.js';
import { IAGENT_RUNTIME } from './agent-runtime.token.js';
import { MailboxService } from './mailbox/mailbox.service.js';
import { MailboxRepository } from './mailbox/mailbox.repository.js';
import { EventsModule } from '../events/events.module.js';
import { DbModule } from '../db/prisma.module.js';
import { ProjectRegistryModule } from '../project-registry/project-registry.module.js';
import {
  SESSION_TERMINATOR,
  SESSION_REGISTRY,
} from '../../domain/ports/index.js';

@Module({
  imports: [EventsModule, DbModule, ProjectRegistryModule],
  providers: [
    // Concrete adapter registered under the IAGENT_RUNTIME token (adapter pattern).
    // SessionManager injects IAgentRuntime via the token — no direct class import.
    { provide: IAGENT_RUNTIME, useClass: ClaudeCodeAdapter },
    // ClaudeCodeAdapter also registered as itself so it can be injected in tests
    // that need the concrete class (e.g., integration specs).
    ClaudeCodeAdapter,
    RequestQueue,
    SessionManager,
    // Bind port tokens to the concrete SessionManager implementation
    { provide: SESSION_TERMINATOR, useExisting: SessionManager },
    { provide: SESSION_REGISTRY, useExisting: SessionManager },
    AgentWatchdog,
    // Phase 5.3 — worker mailbox (SC-9)
    MailboxRepository,
    MailboxService,
  ],
  exports: [
    IAGENT_RUNTIME,
    ClaudeCodeAdapter,
    RequestQueue,
    SessionManager,
    AgentWatchdog,
    SESSION_TERMINATOR,
    SESSION_REGISTRY,
    // Phase 5.3 — worker mailbox (SC-9)
    MailboxRepository,
    MailboxService,
  ],
})
export class SessionsModule {}
