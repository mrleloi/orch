---
name: profile-yaml
description: Use when editing `.orch/profile.yaml`, the profile zod schema, or any profile-loader / project-registry code that parses or validates profiles.
tools: [Read, Bash, Edit]
archetype: reference
---

# Profile YAML — Orch Patterns

## When to Use

- Editing profile zod schema (packages/core/src/domain/profile.schema.ts)
- Implementing `ProjectRegistryService`
- Writing `orch attach` interactive flow
- Validating new profiles
- Migrating between schema versions

## Reference Index

| Topic | File | When to read |
|-------|------|--------------|
| Parsing | `.claude/skills/profile-yaml/references/parsing.md` | `loadProfile`, env-var resolution, ZodError formatting |
| Cross-field validation | `.claude/skills/profile-yaml/references/cross-field-validation.md` | `superRefine` patterns (no_mix, context_policy thresholds, budget caps) |
| Hot reload | `.claude/skills/profile-yaml/references/hot-reload.md` | `ProjectRegistryService` watcher pattern, fail-soft on bad profile |
| Secrets + interactive | `.claude/skills/profile-yaml/references/secrets-and-interactive.md` | secret-pattern detection, `orch attach` interactive flow, migration hooks |

## Quick Reference: Load + Validate

```typescript
import { loadProfile, validateNoSecrets } from './profile-loader';

const raw = readFileSync('.orch/profile.yaml', 'utf-8');
validateNoSecrets(raw);                 // BEFORE env-var resolution
const profile = loadProfile(path);      // throws ZodError on invalid

// Profile is now strongly typed via zod inference.
```

`validateNoSecrets` runs on the raw committed form — secrets caught even if a `${SECRET}` env var was supplied.

## Quick Reference: Cross-Field Rule

```typescript
profileSchema.superRefine((profile, ctx) => {
  if (profile.context_policy.force_handoff_at_tokens <= profile.context_policy.warn_at_tokens) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['context_policy'],
      message: 'force_handoff_at_tokens must be > warn_at_tokens',
    });
  }
});
```

## Anti-Patterns (top 3)

- Directly reading YAML without zod parse (untyped any)
- Logging full profile contents (may contain sensitive paths)
- Storing hot-reloaded profile in mutable module-level state (use service)

See `.claude/skills/profile-yaml/references/parsing.md`, `.claude/skills/profile-yaml/references/hot-reload.md`, and `.claude/skills/profile-yaml/references/secrets-and-interactive.md` for full lists.
