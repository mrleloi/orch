/**
 * Barrel export for domain/ports — DI port interfaces + injection tokens.
 *
 * Ports define the boundary between domain logic and infrastructure.
 * Concrete implementations live in feature modules (Task 1.9d).
 *
 * I-14: Re-exports pure TS types/constants only — no framework imports.
 */

export {
  SESSION_TERMINATOR,
  type ISessionTerminator,
} from './session-terminator.port.js';

export {
  SESSION_REGISTRY,
  type ISessionRegistry,
} from './session-registry.port.js';
