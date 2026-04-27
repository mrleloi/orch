/**
 * Barrel export for domain/watchdog — pure watchdog logic.
 *
 * I-14: Re-exports pure TS types/functions only — zero @nestjs/* imports.
 */

export {
  decideAction,
  type WatchdogAction,
  type WatchdogSession,
  type DecideActionInput,
} from './decide-action.js';
