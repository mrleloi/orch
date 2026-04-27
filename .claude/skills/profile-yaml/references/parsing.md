# Parsing

`loadProfile`, env-var resolution, ZodError formatting.

## Schema Source of Truth

Full schema in `specs/tier2-feature/004-profile-schema.md`.

Implementation:
- Zod: `packages/core/src/domain/profile.schema.ts`
- Type: `packages/core/src/domain/profile.ts`
- Loader: `packages/core/src/modules/project-registry/profile-loader.ts`

## Parsing Pattern

```typescript
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { profileSchema, Profile } from './profile.schema';

export function loadProfile(path: string): Profile {
  const raw = readFileSync(path, 'utf-8');
  const resolved = resolveEnvVars(raw);
  const parsed = parseYaml(resolved);
  return profileSchema.parse(parsed); // throws ZodError on invalid
}

function resolveEnvVars(raw: string): string {
  return raw.replace(/\$\{([A-Z_][A-Z0-9_]*)(?::([^}]*))?\}/g, (_, name, defaultVal) => {
    const val = process.env[name];
    if (val !== undefined) return val;
    if (defaultVal !== undefined) return defaultVal;
    throw new ProfileLoadError(`Required env var ${name} is not set`);
  });
}
```

## Validation Errors

Zod gives rich errors. Format them user-friendly:

```typescript
try {
  return profileSchema.parse(data);
} catch (err) {
  if (err instanceof z.ZodError) {
    const issues = err.issues.map(i => {
      const path = i.path.join('.');
      return `  - ${path}: ${i.message}`;
    }).join('\n');
    throw new ProfileLoadError(
      `Invalid profile:\n${issues}`,
      { cause: err },
    );
  }
  throw err;
}
```

Example output:
```
Invalid profile:
  - session_types: array must contain at least 1 element
  - queue.sources.0.type: unrecognized type
  - budget.daily_tokens_max: must be positive integer
```

## Anti-Patterns

- Directly reading YAML without zod parse (untyped any)
- Allowing unknown keys silently (strict mode; warn on unknown)
- Parsing JSON as YAML (use yaml lib, not JSON.parse — stricter)
