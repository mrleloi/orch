# Cross-Field Validation

`superRefine` patterns (no_mix, context_policy thresholds, budget caps).

## superRefine Pattern

Zod `.refine` or `.superRefine` for rules across fields:

```typescript
export const profileSchema = baseProfileSchema.superRefine((profile, ctx) => {
  // session_type_rules reference must exist
  const declaredTypes = new Set(profile.session_types.map(t => t.name));
  for (const [a, b] of profile.session_type_rules.no_mix) {
    if (!declaredTypes.has(a)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['session_type_rules', 'no_mix'],
        message: `session type "${a}" in no_mix not declared in session_types`,
      });
    }
    if (!declaredTypes.has(b)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['session_type_rules', 'no_mix'],
        message: `session type "${b}" in no_mix not declared in session_types`,
      });
    }
  }

  // context_policy.force_handoff_at > warn_at
  if (profile.context_policy.force_handoff_at_tokens <= profile.context_policy.warn_at_tokens) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['context_policy'],
      message: 'force_handoff_at_tokens must be > warn_at_tokens',
    });
  }

  // budget.per_session_tokens_max <= daily_tokens_max
  if (profile.budget.per_session_tokens_max > profile.budget.daily_tokens_max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['budget'],
      message: 'per_session_tokens_max cannot exceed daily_tokens_max',
    });
  }
});
```

## Tests

- Valid profile parses
- Invalid (missing required, wrong types, unknown session_type referenced)
- Cross-field validation
- Env var resolution (required, optional, missing, default)
