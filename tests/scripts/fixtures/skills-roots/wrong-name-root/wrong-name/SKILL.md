---
name: different-name
description: A skill where frontmatter name does not match directory name.
allowed-tools: [Read]
---

# Wrong Name Skill

The frontmatter `name` field says "different-name" but the directory is "wrong-name".
Validator should emit `name-mismatch` error.
