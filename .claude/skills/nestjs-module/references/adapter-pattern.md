# Adapter Pattern via DI Tokens

## Symbol Token and Interface

```typescript
// interfaces/agent-runtime.ts
export const AGENT_RUNTIME = Symbol.for('AGENT_RUNTIME');

export interface IAgentRuntime {
  spawn(req: SpawnRequest): Promise<SpawnResult>;
  resume(sessionId: string, prompt: string): Promise<SpawnResult>;
  terminate(sessionId: string, signal: 'SIGTERM' | 'SIGKILL'): Promise<void>;
}
```

## Module Wiring

```typescript
// modules/session/session.module.ts
@Module({
  providers: [
    SessionService,
    {
      provide: AGENT_RUNTIME,
      useClass: ClaudeCodeAdapter, // swap this for tests or alternative runtime
    },
  ],
  exports: [SessionService],
})
export class SessionModule {}
```

## Service Injection

```typescript
// session.service.ts
@Injectable()
export class SessionService {
  constructor(
    @Inject(AGENT_RUNTIME) private readonly runtime: IAgentRuntime,
  ) {}
}
```

## Adapter Implementation Example

```typescript
// adapters/claude-code.adapter.ts
@Injectable()
export class ClaudeCodeAdapter implements IAgentRuntime {
  async spawn(req: SpawnRequest): Promise<SpawnResult> {
    // execa('claude', [...]) logic here
  }
  async resume(sessionId: string, prompt: string): Promise<SpawnResult> {
    // execa('claude', ['--resume', sessionId, ...])
  }
  async terminate(sessionId: string, signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
    // kill subprocess
  }
}
```

## Swap for Tests

```typescript
const module = await Test.createTestingModule({
  providers: [
    SessionService,
    {
      provide: AGENT_RUNTIME,
      useValue: {
        spawn: vi.fn(),
        resume: vi.fn(),
        terminate: vi.fn(),
      },
    },
  ],
}).compile();
```

Core never imports a specific runtime adapter -- only the symbol + interface.
