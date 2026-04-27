# Secrets + Interactive

Secret-pattern detection + `orch attach` interactive flow + migration hooks.

## Secrets Must Not Be In Profile

Invariant check:
```typescript
export function validateNoSecrets(raw: string): void {
  const patterns = [
    /sk-[a-zA-Z0-9]{20,}/,        // Anthropic / OpenAI style
    /ghp_[a-zA-Z0-9]{30,}/,       // GitHub PAT
    /xox[baprs]-[a-zA-Z0-9-]+/,   // Slack
    /\d{10}:[a-zA-Z0-9_-]{35}/,   // Telegram bot token pattern
  ];
  for (const p of patterns) {
    if (p.test(raw)) {
      throw new ProfileLoadError(
        'Profile contains what looks like a secret. Secrets belong in env vars or .orch/secrets.yaml (gitignored).',
      );
    }
  }
}
```

Run this BEFORE env var resolution (so the check operates on committed form).

Tests:
- Secret detection

## Interactive Profile Generation (orch attach)

```typescript
import { input, select, confirm, checkbox } from '@inquirer/prompts';

async function createProfileInteractive(projectPath: string): Promise<Profile> {
  const name = await input({
    message: 'Project name (slug):',
    default: path.basename(projectPath),
    validate: v => /^[a-z0-9-]+$/.test(v) || 'slug format: lowercase, digits, dashes',
  });

  const adapter = await select({
    message: 'Runtime adapter:',
    choices: [
      { value: 'claude-code', name: 'Claude Code (via ccs)' },
      { value: 'codex', name: 'OpenAI Codex' },
    ],
  });

  const ccsPrimary = await input({
    message: 'Primary ccs profile:',
    default: 'pro',
  });

  const sessionTypesSelected = await checkbox({
    message: 'Session types used in this project:',
    choices: ALL_SESSION_TYPES.map(t => ({ value: t, checked: true })),
  });

  const injectHooks = await confirm({
    message: `Inject hooks into ${projectPath}/.claude/settings.json?`,
    default: true,
  });

  // ... build full profile object

  return profileSchema.parse(built); // validate at the end
}
```

## Migration Hooks (Future)

```typescript
const migrations: Record<string, (data: unknown) => unknown> = {
  '1.0 -> 2.0': (data) => {
    // transform shape
    return newData;
  },
};

function migrate(data: any): any {
  let current = data;
  while (current.schemaVersion !== CURRENT_VERSION) {
    const key = `${current.schemaVersion} -> ${nextVersion(current.schemaVersion)}`;
    const migrator = migrations[key];
    if (!migrator) throw new Error(`No migration for ${key}`);
    current = migrator(current);
  }
  return current;
}
```

Not needed for v1 (only schema 1.0 exists).

## Anti-Patterns

- Logging full profile contents (may contain paths considered sensitive)
