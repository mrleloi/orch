/**
 * Regression test SC-37: all 5 Mandates A/B/C/D/E present in sandwich-architect.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const content = readFileSync(
  resolve(__dirname, '..', '..', '.claude', 'agents', 'sandwich-architect.md'),
  'utf8',
);

describe('sandwich-architect mandates (SC-37)', () => {
  it('case 1: all five mandate headings A-E are present', () => {
    expect(/Mandate A/.test(content), 'Mandate A missing').toBe(true);
    expect(/Mandate B/.test(content), 'Mandate B missing').toBe(true);
    expect(/Mandate C/.test(content), 'Mandate C missing').toBe(true);
    expect(/Mandate D/.test(content), 'Mandate D missing').toBe(true);
    expect(/Mandate E/.test(content), 'Mandate E missing').toBe(true);
  });

  it('case 2: Mandate E contains incremental-write keyword and rationale references', () => {
    expect(/[Ii]ncremental write/.test(content), 'missing "incremental write"').toBe(true);
    expect(/6\.5\.3/.test(content), 'missing 6.5.3 cross-reference').toBe(true);
    expect(/phase-6-complete\.md/.test(content), 'missing phase-6-complete.md cross-ref').toBe(true);
  });

  it('case 3: mandates appear in alphabetical order A → B → C → D → E', () => {
    const pos = (s: string) => content.indexOf(s);
    const [a, b, c, d, e] = ['Mandate A', 'Mandate B', 'Mandate C', 'Mandate D', 'Mandate E'].map(pos);
    expect(a, 'Mandate A not found').toBeGreaterThan(-1);
    expect(a, 'A must precede B').toBeLessThan(b);
    expect(b, 'B must precede C').toBeLessThan(c);
    expect(c, 'C must precede D').toBeLessThan(d);
    expect(d, 'D must precede E').toBeLessThan(e);
  });
});
