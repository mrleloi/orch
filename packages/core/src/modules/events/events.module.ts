/**
 * EventsModule — global NestJS module for the typed event bus.
 *
 * @Global() ensures EventBusService is available for injection across all feature
 * modules without each module importing EventsModule individually.
 *
 * Configuration:
 *  - wildcard: true  — allows `project.*` wildcard listeners
 *  - maxListeners: 50 — avoids Node.js MaxListenersExceededWarning in a module-rich app
 *
 * Cross-module communication pattern: modules emit via EventBusService; they do not
 * import each other directly (architecture invariant).
 */

import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service.js';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      maxListeners: 50,
    }),
  ],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}
