/**
 * IAGENT_RUNTIME — NestJS injection token for the IAgentRuntime adapter.
 *
 * Using a symbol token decouples SessionManager from the concrete
 * ClaudeCodeAdapter class, satisfying the adapter-pattern invariant:
 * core modules must not import specific runtime implementations.
 *
 * Wired in SessionsModule:
 *   { provide: IAGENT_RUNTIME, useClass: ClaudeCodeAdapter }
 *
 * Consumed in SessionManager:
 *   @Inject(IAGENT_RUNTIME) private runtime: IAgentRuntime
 *
 * I-14: This file is infrastructure (NestJS DI token); it is intentionally
 * NOT in domain/ (tokens require the Symbol primitive, but no NestJS imports).
 */

export const IAGENT_RUNTIME = Symbol('IAgentRuntime');
