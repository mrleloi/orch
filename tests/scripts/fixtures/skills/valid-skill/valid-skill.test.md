---
skill: valid-skill
---

# valid-skill — Test File

## Trigger

Use when testing the skill validator with a clean, passing fixture.

## Expected behavior (PASS)

The validator reports zero errors and zero warnings for this skill.

## Named failure modes

- **No frontmatter**: validator emits `frontmatter-required` error.
- **Name mismatch**: validator emits `name-mismatch` error.
- **Body too large**: validator emits `oversize-body` error.

## Assertions

1. `result.errors.length === 0` when validating this fixture.
2. `result.warnings.length === 0` when validating this fixture.
3. `result.scannedSkills === 1` when rootDir contains only this skill.
