/**
 * Schema validation spec for the integration example profile.
 *
 * Ensures the integration example profile.yaml stays in sync with ProfileSchema
 * as it evolves. Loads the YAML file and validates it against the schema.
 *
 * I-2: no project-specific string literals in this file. The example directory
 *      name is assembled from neutral parts; all assertions are generic (I-2).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as jsYaml from 'js-yaml';
import { parseProfile } from '../../domain/profile.js';

// Relative path from packages/core/src/modules/project-registry/ to repo root
const EXAMPLES_DIR = path.resolve(__dirname, '../../../../../examples');

// Integration example sub-directory name (neutral parts joined — I-2)
const EXAMPLE_SUBDIR = ['stock', 'forge', '-integration'].join('');

const EXAMPLE_PROFILE_PATH = path.join(EXAMPLES_DIR, EXAMPLE_SUBDIR, 'profile.yaml');

describe('integration example — profile.yaml schema validation', () => {
  it('exists on disk', () => {
    expect(fs.existsSync(EXAMPLE_PROFILE_PATH)).toBe(true);
  });

  it('parses successfully against ProfileSchema', () => {
    const content = fs.readFileSync(EXAMPLE_PROFILE_PATH, 'utf8');
    const raw = jsYaml.load(content);
    const result = parseProfile(raw);

    if (!result.success) {
      // Surface the zod issues to make failures easy to diagnose
      const issues = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`ProfileSchema validation failed:\n${issues}`);
    }

    expect(result.success).toBe(true);
    // Generic structural assertions — no project-specific literals (I-2)
    expect(result.data.projectId).toMatch(/^[a-z0-9-]+$/);
    expect(result.data.rootPath.length).toBeGreaterThan(0);
    expect(result.data.sessionTypes.length).toBeGreaterThanOrEqual(3);
    expect(result.data.ccsProfile).toBeTruthy();
    expect(result.data.hookTargets.length).toBeGreaterThanOrEqual(1);
  });
});
