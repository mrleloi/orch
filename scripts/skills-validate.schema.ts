import { z } from 'zod';

// Frontmatter schema (SKILL.md YAML between `---` fences)
export const SkillFrontmatterSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'must be kebab-case'),
    description: z.string().min(1),
    // 'allowed-tools': comma-separated string OR array of strings.
    // Optional in v2.0 (pre-5.2.7); enforced as required AFTER 5.2.7 lands by
    // setting requireAllowedTools=true in ValidatorOptions.
    'allowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
    // Optional metadata fields tolerated:
    model: z.string().optional(),
    tools: z.array(z.string()).optional(),
  })
  .passthrough(); // unknown frontmatter keys = warning, not error

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

// Issue model emitted by the validator
export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  severity: IssueSeverity;
  // Rule identifier — stable across invocations
  rule: string;
  // Canonical skill dir name (the glob-star segment from .claude/skills/<name>/SKILL.md)
  skill: string;
  // Absolute path to the file that triggered the issue
  file: string;
  // Line number when applicable
  line?: number;
  // Human-readable message
  message: string;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
  scannedSkills: number;
}
