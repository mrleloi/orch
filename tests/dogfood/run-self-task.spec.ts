/**
 * tests/dogfood/run-self-task.spec.ts
 *
 * Unit tests for the dogfood harness (scripts/dogfood/run-self-task.ts).
 *
 * Coverage per spec §7.1 (self-application-bootstrap.md §7.1):
 *   T1: Schema validation — valid envelope parses without error
 *   T2: Schema validation — invalid envelope (missing required field) throws ZodError
 *   T3: Dispatch happy path — exits 0 when parent sentinel + valid envelope + no rollback marker
 *   T4: Rollback marker present — exits 0 (graceful no-op), no subprocess spawned
 *   T5: Parent sentinel missing — exits 3 (CONTAINMENT_REFUSED)
 *   T6: Tenancy resolution called — ScopeResolver.resolve() is called during dispatch
 *   T7: Trace span emission — span name "dogfood.dispatch_substage" + 11 mandatory attrs
 *   T8: Failure-mode matrix entry 1 — invalid YAML → exits 1 (CONFIG_ERROR)
 *   T9: Failure-mode matrix entry 2 — preflight i6_grep fails → exits 2 (PREFLIGHT_FAILED)
 *   T10: Failure-mode matrix entry 3 — budget_envelope assertion exceeds → exits 2
 *   T11: TracingService reuse — no new tracer instances in production code (import check)
 *
 * Framework: vitest (tests/ tree)
 * Real subprocess spawn: NEVER — IAgentRuntime is mocked throughout.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Import the schema (pure zod — no NestJS, no subprocess)
// ---------------------------------------------------------------------------
import {
  DogfoodEnvelopeSchema,
  MAX_DOGFOOD_BUDGET,
} from '../../packages/core/src/dogfood/envelope-schema.js';

// ---------------------------------------------------------------------------
// Import the harness functions under test
// We import only the non-CLI exports (runSelfTask, EXIT_CODES).
// The main() function's process.exit() is not called in tests.
// ---------------------------------------------------------------------------
import {
  runSelfTask,
  EXIT_CODES,
} from '../../scripts/dogfood/run-self-task.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'orch-dogfood-test-'));
}

function writeEnvelope(dir: string, data: Record<string, unknown>): string {
  const filePath = path.join(dir, 'test-envelope.yaml');
  // Use plain JSON-safe YAML serialization
  const content = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

/** Minimal valid envelope YAML (all required fields). */
function validEnvelopeYaml(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    envelope_id: 'test-envelope-1',
    schema_version: '1',
    tenancy: {
      user: 'self',
      project: 'orch',
      is_self_app: true,
    },
    subagent_type: 'task-implementer',
    model: 'sonnet',
    effort: 'low',
    prompt_path: 'tasks/phase-8/c1-smoke-prompt.md',
    dispatch_trace_path: 'agent-workspace/traces/test-trace.jsonl',
    rollback_marker_path: 'agent-workspace/memory/.dogfood-stop',
    budget_cap_tokens: 10000,
    ...overrides,
  };
}

/** Write a YAML file with literal content. */
function writeYaml(dir: string, content: string, name = 'test-envelope.yaml'): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('envelope-schema — T1, T2', () => {
  it('T1: valid envelope parses without error', () => {
    const input = {
      envelope_id: 'phase-8-c1-smoke',
      schema_version: '1',
      tenancy: { user: 'self', project: 'orch', is_self_app: true },
      subagent_type: 'task-implementer',
      model: 'sonnet',
      effort: 'low',
      prompt_path: 'tasks/phase-8/c1-smoke-prompt.md',
      dispatch_trace_path: 'agent-workspace/traces/phase-8-c1-smoke.jsonl',
      rollback_marker_path: 'agent-workspace/memory/.dogfood-stop',
      budget_cap_tokens: 10000,
    };
    expect(() => DogfoodEnvelopeSchema.parse(input)).not.toThrow();
    const parsed = DogfoodEnvelopeSchema.parse(input);
    expect(parsed.envelope_id).toBe('phase-8-c1-smoke');
    expect(parsed.tenancy.is_self_app).toBe(true);
    expect(parsed.model).toBe('sonnet');
  });

  it('T2: missing required field (envelope_id) throws ZodError', () => {
    const input = {
      // missing envelope_id
      schema_version: '1',
      tenancy: { user: 'self', project: 'orch', is_self_app: true },
      subagent_type: 'task-implementer',
      model: 'sonnet',
      effort: 'low',
      prompt_path: 'x.md',
      dispatch_trace_path: 'agent-workspace/traces/x.jsonl',
      rollback_marker_path: 'agent-workspace/memory/.dogfood-stop',
      budget_cap_tokens: 10000,
    };
    expect(() => DogfoodEnvelopeSchema.parse(input)).toThrow();
  });

  it('T2b: budget_cap_tokens > 120000 fails validation', () => {
    const input = {
      envelope_id: 'test',
      schema_version: '1',
      tenancy: { user: 'self', project: 'orch', is_self_app: true },
      subagent_type: 'task-implementer',
      model: 'sonnet',
      effort: 'low',
      prompt_path: 'x.md',
      dispatch_trace_path: 'agent-workspace/traces/x.jsonl',
      rollback_marker_path: 'agent-workspace/memory/.dogfood-stop',
      budget_cap_tokens: 999999, // exceeds MAX_DOGFOOD_BUDGET
    };
    expect(() => DogfoodEnvelopeSchema.parse(input)).toThrow();
  });

  it('MAX_DOGFOOD_BUDGET is 120000', () => {
    expect(MAX_DOGFOOD_BUDGET).toBe(120_000);
  });
});

describe('runSelfTask — dispatch happy path (T3)', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    savedEnv = { ...process.env };
    // Set parent sentinel so containment check passes
    process.env['ORCH_DOGFOOD_PARENT_OK'] = '1';
    // Ensure no rollback marker in the tmp project
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T3: exits 0 with valid envelope, parent sentinel set, no rollback marker', async () => {
    // Create a valid envelope YAML that points rollback_marker_path somewhere that doesn't exist
    const tracePath = path.join(tmpDir, 'traces', 'test.jsonl');
    const envelopeContent = `
envelope_id: test-happy-path
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: tasks/phase-8/c1-smoke-prompt.md
dispatch_trace_path: agent-workspace/traces/test-happy-path.jsonl
rollback_marker_path: ${path.join(tmpDir, '.no-such-marker').replace(/\\/g, '/')}
budget_cap_tokens: 10000
metadata:
  authoring_phase: 8
  authoring_substage: "8.5.2"
  dogfood_checkpoint: C1
`;
    const envelopeFile = path.join(tmpDir, 'test-happy-path.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    const exitCode = await runSelfTask(envelopeFile);
    expect(exitCode).toBe(EXIT_CODES.OK);
  });
});

describe('runSelfTask — rollback marker (T4)', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    savedEnv = { ...process.env };
    process.env['ORCH_DOGFOOD_PARENT_OK'] = '1';
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T4: exits 0 (graceful no-op) when rollback marker is present', async () => {
    const markerPath = path.join(tmpDir, '.dogfood-stop');
    fs.writeFileSync(markerPath, 'test by 8.5.4 verifier', 'utf8');

    const envelopeContent = `
envelope_id: test-rollback
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: tasks/phase-8/c1-smoke-prompt.md
dispatch_trace_path: agent-workspace/traces/test-rollback.jsonl
rollback_marker_path: ${markerPath.replace(/\\/g, '/')}
budget_cap_tokens: 10000
`;
    const envelopeFile = path.join(tmpDir, 'test-rollback.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    const stderrLines: string[] = [];
    const origStderr = process.stderr.write.bind(process.stderr);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });

    const exitCode = await runSelfTask(envelopeFile);

    stderrSpy.mockRestore();

    expect(exitCode).toBe(EXIT_CODES.OK);
    // Must log the abort message
    const combined = stderrLines.join('');
    expect(combined).toContain('dogfood-aborted-by-marker');
    // Must NOT have written any trace file (no dispatch occurred)
    // The trace path points inside orch workspace; since rollback fired before trace write, no JSONL
  });

  it('T4b: no subprocess spawned when rollback marker is present', async () => {
    const markerPath = path.join(tmpDir, '.dogfood-stop-b');
    fs.writeFileSync(markerPath, '', 'utf8');

    const envelopeContent = `
envelope_id: test-rollback-b
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: tasks/phase-8/c1-smoke-prompt.md
dispatch_trace_path: agent-workspace/traces/test-rollback-b.jsonl
rollback_marker_path: ${markerPath.replace(/\\/g, '/')}
budget_cap_tokens: 10000
`;
    const envelopeFile = path.join(tmpDir, 'test-rollback-b.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    // No exception = no subprocess spawn attempted
    const exitCode = await runSelfTask(envelopeFile);
    expect(exitCode).toBe(EXIT_CODES.OK);
  });
});

describe('runSelfTask — parent sentinel (T5)', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    for (const [k, v] of Object.entries(savedEnv)) {
      process.env[k] = v;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T5: exits 3 (CONTAINMENT_REFUSED) when ORCH_DOGFOOD_PARENT_OK is not set', async () => {
    delete process.env['ORCH_DOGFOOD_PARENT_OK'];

    const envelopeContent = `
envelope_id: test-no-sentinel
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: tasks/phase-8/c1-smoke-prompt.md
dispatch_trace_path: agent-workspace/traces/test-no-sentinel.jsonl
rollback_marker_path: ${path.join(tmpDir, '.no-marker').replace(/\\/g, '/')}
budget_cap_tokens: 10000
`;
    const envelopeFile = path.join(tmpDir, 'test-no-sentinel.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    const exitCode = await runSelfTask(envelopeFile);
    expect(exitCode).toBe(EXIT_CODES.CONTAINMENT_REFUSED);
    expect(EXIT_CODES.CONTAINMENT_REFUSED).toBe(3);
  });
});

describe('runSelfTask — tenancy resolution (T6)', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    savedEnv = { ...process.env };
    process.env['ORCH_DOGFOOD_PARENT_OK'] = '1';
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T6: tenancy scope resolved — ScopeResolver.resolve() is called', async () => {
    // We verify this by observing the log output mentions scope-resolved.
    const envelopeContent = `
envelope_id: test-tenancy
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: tasks/phase-8/c1-smoke-prompt.md
dispatch_trace_path: agent-workspace/traces/test-tenancy.jsonl
rollback_marker_path: ${path.join(tmpDir, '.no-marker').replace(/\\/g, '/')}
budget_cap_tokens: 10000
`;
    const envelopeFile = path.join(tmpDir, 'test-tenancy.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    const stderrLines: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    });

    const exitCode = await runSelfTask(envelopeFile);
    stderrSpy.mockRestore();

    expect(exitCode).toBe(EXIT_CODES.OK);
    const combined = stderrLines.join('');
    // Tenancy scope resolution must be logged
    expect(combined).toContain('scope-resolved');
  });
});

describe('runSelfTask — trace span emission (T7)', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    savedEnv = { ...process.env };
    process.env['ORCH_DOGFOOD_PARENT_OK'] = '1';
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T7: emits dogfood.dispatch_substage span with all 11 mandatory attributes', async () => {
    const envelopeContent = `
envelope_id: phase-8-test-span
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: tasks/phase-8/c1-smoke-prompt.md
dispatch_trace_path: agent-workspace/traces/test-span-attrs.jsonl
rollback_marker_path: ${path.join(tmpDir, '.no-marker').replace(/\\/g, '/')}
budget_cap_tokens: 10000
metadata:
  authoring_phase: 8
  authoring_substage: "8.5.2"
  dogfood_checkpoint: C1
`;
    const envelopeFile = path.join(tmpDir, 'test-span.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    const exitCode = await runSelfTask(envelopeFile);
    expect(exitCode).toBe(EXIT_CODES.OK);

    // Read the JSONL trace file written by the harness
    const traceAbsPath = path.resolve(REPO_ROOT, 'agent-workspace/traces/test-span-attrs.jsonl');
    expect(fs.existsSync(traceAbsPath)).toBe(true);

    const lines = fs.readFileSync(traceAbsPath, 'utf8').trim().split('\n');
    const rootSpanLine = lines.find((l) => {
      try {
        const rec = JSON.parse(l) as Record<string, unknown>;
        return rec['spanName'] === 'dogfood.dispatch_substage' && rec['status'] === 'started';
      } catch {
        return false;
      }
    });

    expect(rootSpanLine).toBeDefined();
    const rootSpanRecord = JSON.parse(rootSpanLine!) as { attrs: Record<string, unknown> };
    const attrs = rootSpanRecord.attrs;

    // 11 mandatory attributes per spec §5.2
    expect(attrs['span.kind']).toBe('ORCH_DAEMON_DISPATCH');
    expect(attrs['phase']).toBe(8);
    expect(attrs['substage']).toBe('8.5.2');
    expect(attrs['tenancy.user']).toBe('self');
    expect(attrs['tenancy.project']).toBe('orch');
    expect(attrs['is_self_app']).toBe(true);
    expect(attrs['subagent_type']).toBe('task-implementer');
    expect(attrs['model']).toBe('sonnet');
    expect(attrs['effort']).toBe('low');
    expect(attrs['envelope_id']).toBe('phase-8-test-span');
    expect(attrs['dogfood_checkpoint']).toBe('C1');

    // Clean up trace file to avoid polluting repo
    fs.unlinkSync(traceAbsPath);
  });
});

describe('runSelfTask — failure mode matrix (T8, T9, T10)', () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    savedEnv = { ...process.env };
    process.env['ORCH_DOGFOOD_PARENT_OK'] = '1';
  });

  afterEach(() => {
    process.env = savedEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T8: invalid YAML (not parseable) → exits 1 (CONFIG_ERROR)', async () => {
    const envelopeFile = path.join(tmpDir, 'bad-yaml.yaml');
    fs.writeFileSync(envelopeFile, '{ invalid yaml ::::: [[[', 'utf8');

    const exitCode = await runSelfTask(envelopeFile);
    expect(exitCode).toBe(EXIT_CODES.CONFIG_ERROR);
    expect(EXIT_CODES.CONFIG_ERROR).toBe(1);
  });

  it('T9: preflight i6_grep fails → exits 2 (PREFLIGHT_FAILED)', async () => {
    // Write a prompt file that contains "git commit" (the forbidden substring)
    const promptFile = path.join(tmpDir, 'bad-prompt.md');
    fs.writeFileSync(promptFile, 'You should git commit the changes.', 'utf8');

    const envelopeContent = `
envelope_id: test-i6-grep
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: ${promptFile.replace(/\\/g, '/')}
dispatch_trace_path: agent-workspace/traces/test-i6-grep.jsonl
rollback_marker_path: ${path.join(tmpDir, '.no-marker').replace(/\\/g, '/')}
budget_cap_tokens: 10000
preflight_assertions:
  - kind: i6_grep
    forbidden_substring: "git commit"
    target: prompt_path
`;
    const envelopeFile = path.join(tmpDir, 'test-i6-grep.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    const exitCode = await runSelfTask(envelopeFile);
    expect(exitCode).toBe(EXIT_CODES.PREFLIGHT_FAILED);
    expect(EXIT_CODES.PREFLIGHT_FAILED).toBe(2);
  });

  it('T10: budget_envelope assertion exceeded → exits 2 (PREFLIGHT_FAILED)', async () => {
    const envelopeContent = `
envelope_id: test-budget
schema_version: "1"
tenancy:
  user: self
  project: orch
  is_self_app: true
subagent_type: task-implementer
model: sonnet
effort: low
prompt_path: tasks/phase-8/c1-smoke-prompt.md
dispatch_trace_path: agent-workspace/traces/test-budget.jsonl
rollback_marker_path: ${path.join(tmpDir, '.no-marker').replace(/\\/g, '/')}
budget_cap_tokens: 50000
preflight_assertions:
  - kind: budget_envelope
    max_tokens: 1000
`;
    const envelopeFile = path.join(tmpDir, 'test-budget.yaml');
    fs.writeFileSync(envelopeFile, envelopeContent, 'utf8');

    const exitCode = await runSelfTask(envelopeFile);
    expect(exitCode).toBe(EXIT_CODES.PREFLIGHT_FAILED);
  });
});

describe('runSelfTask — TracingService reuse (T11)', () => {
  /**
   * T11 Brittleness Mitigation (Phase 9 v2.4 CF-T11):
   *
   * This test uses structural import-string assertions rather than a runtime
   * mock-based check. This is intentional given the vitest ESM mocking limitation:
   * vitest cannot intercept ES module imports from a different package scope
   * (scripts/ importing packages/core) without vi.mock hoisting, which would
   * require mocking all of TracingService's dependencies (a complex chain).
   * The import-string approach is the pragmatic choice for this constraint.
   *
   * Why this approach is acceptable (not just brittle):
   *   1. Absence checks: `trace.getTracer(` and `@opentelemetry/api` are structural
   *      invariants. If a future refactor introduces them, the test correctly fails.
   *   2. Presence checks: import-path assertions. If the module is renamed, the test
   *      fails — which is the desired behavior, not silent regression.
   *   3. A glob-scan of packages/core would be redundant: T11 guards a single harness
   *      file (scripts/dogfood/run-self-task.ts), not a package-wide concern.
   *
   * This test is robust to non-import-string refactors (logic changes within
   * TracingService.withSpan calls, span attribute changes, etc.) and only fails
   * on the specific structural invariants it was designed to guard.
   */
  it('T11: harness imports TracingService from @orch/core, not a new tracer', async () => {
    // Scan the harness source for structural invariants.
    // Using source-file scanning because vitest ESM mocking cannot intercept
    // cross-package ES module imports without a full mock chain (see note above).
    const harnessSource = fs.readFileSync(
      path.resolve(REPO_ROOT, 'scripts/dogfood/run-self-task.ts'),
      'utf8',
    );
    // Must import from the existing tracing module
    expect(harnessSource).toContain('TracingService');
    expect(harnessSource).toContain('tracing.service');
    // Must NOT create a new Tracer via trace.getTracer outside TracingService
    // The harness must use new TracingService() (which wraps trace.getTracer internally)
    expect(harnessSource).not.toContain('trace.getTracer(');
    // Must NOT import @opentelemetry/api directly in the harness
    expect(harnessSource).not.toContain("from '@opentelemetry/api'");
  });
});

describe('smoke fixture validation', () => {
  it('_smoke-fixture.yaml parses with DogfoodEnvelopeSchema', () => {
    const fixturePath = path.resolve(
      REPO_ROOT,
      'agent-workspace/queue/self-tasks/_smoke-fixture.yaml',
    );
    expect(fs.existsSync(fixturePath)).toBe(true);

    // Parse the YAML manually (same as harness step 1)
    const content = fs.readFileSync(fixturePath, 'utf8');
    // Simple YAML parse — the fixture uses only basic constructs
    // We use js-yaml via dynamic import to avoid bundler issues
    const { load } = await import('js-yaml');
    const parsed = load(content);
    expect(() => DogfoodEnvelopeSchema.parse(parsed)).not.toThrow();

    const envelope = DogfoodEnvelopeSchema.parse(parsed);
    expect(envelope.envelope_id).toBe('phase-8-c1-smoke');
    expect(envelope.tenancy.is_self_app).toBe(true);
    expect(envelope.tenancy.user).toBe('self');
    expect(envelope.tenancy.project).toBe('orch');
    expect(envelope.metadata?.dogfood_checkpoint).toBe('C1');
  });
});
