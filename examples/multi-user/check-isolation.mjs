/**
 * check-isolation.mjs — Assertion driver for demo.sh.
 * Reads SCRATCH_DIR env var. Exit 0 = all pass, exit 1 = any fail.
 */

import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolverUrl = pathToFileURL(
  path.resolve(__dirname, '../../packages/core/src/tenancy/scope-resolver.ts'),
).href;

const { ScopeResolver, TenancyViolationError } = await import(resolverUrl);

const scratchDir = process.env['SCRATCH_DIR'];
if (!scratchDir) { console.error('ERROR: SCRATCH_DIR required'); process.exit(1); }

const resolver = new ScopeResolver({ rootDir: scratchDir });
let passed = 0; let failed = 0;

function assert(label, ok) {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else     { console.error(`  FAIL  ${label}`); failed++; }
}

console.log('\nTenancy isolation assertions:');

// A1: alice CAN read shared/proj-x/SHARED.txt
const sharedScope = resolver.resolve(
  path.join(scratchDir, 'agent-workspace', 'shared-projects', 'proj-x', 'SHARED.txt'));
assert('A1: alice CAN access shared/proj-x/SHARED.txt', resolver.canAccess(sharedScope, 'alice'));

// A2: alice CANNOT read bob/personal/B_SECRET.txt
const bobScope = resolver.resolve(
  path.join(scratchDir, 'agent-workspace', 'bob', 'projects', 'personal', 'B_SECRET.txt'));
assert('A2: alice CANNOT access bob/personal/B_SECRET.txt', !resolver.canAccess(bobScope, 'alice'));

// A3: bob CANNOT read alice/personal/A_SECRET.txt
const aliceScope = resolver.resolve(
  path.join(scratchDir, 'agent-workspace', 'alice', 'projects', 'personal', 'A_SECRET.txt'));
assert('A3: bob CANNOT access alice/personal/A_SECRET.txt', !resolver.canAccess(aliceScope, 'bob'));

// A4: path traversal throws TenancyViolationError
const aliceProjScope = { user: 'alice', project: 'personal', isShared: false };
const traversal = path.join(scratchDir, 'agent-workspace', 'alice', 'projects', 'personal',
  '..', '..', 'bob', 'projects', 'personal', 'secret.md');
let caught = false;
try { resolver.enforcePath(aliceProjScope, traversal); }
catch (e) { if (e instanceof Error && e.name === 'TenancyViolationError') caught = true; }
assert('A4: path traversal throws TenancyViolationError', caught);

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
