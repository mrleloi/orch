---
name: bad-yaml
description: [this is
  not: valid: yaml: at all
  broken: {
---

# Bad YAML Skill

The frontmatter above is malformed YAML. Validator should emit `frontmatter-required` error.
