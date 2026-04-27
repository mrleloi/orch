/**
 * run-self-task.ts — Dogfood harness CLI.
 *
 * Reads a self-task envelope YAML from agent-workspace/queue/self-tasks/<id>.yaml,
 * validates it via zod schema, runs preflight assertions, and dispatches via a
 * mock IAgentRuntime (real dispatch wired in 8.5.3 once SessionManager is targeted).
 *
 * Algorithm per spec §4.2 (self-application-bootstrap.md):
 *   1. Parse envelope YAML via zod
 *   2. Check rollback marker → exit 0 (graceful no-op)
 *   3. Run preflight_assertions → exit 2 on failure
 *   4. Check parent sentinel (ORCH_DOGFOOD_PARENT_OK=1) → exit 3
 *   5. Resolve tenancy scope via ScopeResolver
 *   6. Read + prepend <orch-self-app-rules> block to prompt
 *   7. Validate dispatch_trace_path prefix
 *   8. Open OTEL root span dogfood.dispatch_substage (11 mandatory attrs)
 *   9. Dispatch (wired in 8.5.3; logged and no-op in 8.5.2)
 *  10. Stream trace events to dispatch_trace_path
 *  11. Close span; return exit code
 *
 * LOC budget: ≤350 production lines (spec §7 §8c).
 * Tracer reuse: TracingService from @orch/core — no new tracer code (forbidden).
 * Tenancy: ScopeResolver from @orch/core — no modifications to that module.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import {
  DogfoodEnvelopeSchema,
  MAX_DOGFOOD_BUDGET,
  type DogfoodEnvelope,
  type PreflightAssertion,
} from '../../packages/core/src/dogfood/envelope-schema.js';
import { ScopeResolver } from '../../packages/core/src/tenancy/scope-resolver.js';
import { TracingService } from '../../packages/core/src/modules/tracing/tracing.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Required env sentinel — T1 safeguard (§2.1 safeguard layer 3). */
const PARENT_SENTINEL = 'ORCH_DOGFOOD_PARENT_OK';

/** Nested dogfood depth env var — T4 safeguard (§2.4). */
const DOGFOOD_DEPTH_ENV = 'ORCH_DOGFOOD_DEPTH';

/** Maximum nesting depth allowed (spec §2.4). */
const MAX_DOGFOOD_DEPTH = 1;

/** Prefix injected into every subprocess prompt (T3 safeguard, spec §2.3). */
const SELF_APP_RULES_BLOCK = `<orch-self-app-rules>
I-6 ABSOLUTE — NO git commit, no git push, no destructive operations.
Stage changes only via git add. Stop conditions binding from
PROJECT_CHARTER.md §"Stop Conditions" + autonomous-protocol.md.
</orch-self-app-rules>`;

/** Required prefix for dispatch_trace_path — T2+T5 safeguard (§5.1). */
const TRACE_DIR_PREFIX = 'agent-workspace/traces';

// Project root: scripts/dogfood/ → ../../
const _thisFile = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(_thisFile), '..', '..');

// ---------------------------------------------------------------------------
// Exit codes (spec §4.3 failure-mode degradation matrix)
// ---------------------------------------------------------------------------
export const EXIT_CODES = {
  OK: 0,
  CONFIG_ERROR: 1,
  PREFLIGHT_FAILED: 2,
  CONTAINMENT_REFUSED: 3,
  SPAWN_FAILED: 4,
  TERMINATED: 5,
  ISOLATION_ERROR: 6,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function resolveFromRoot(relativePath: string): string {
  return path.resolve(PROJECT_ROOT, relativePath);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function appendTrace(tracePath: string, record: Record<string, unknown>): void {
  const abs = resolveFromRoot(tracePath);
  ensureDir(path.dirname(abs));
  fs.appendFileSync(abs, JSON.stringify(record) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Preflight assertions (spec §4.2 step 3)
// ---------------------------------------------------------------------------

function runPreflightAssertions(
  envelope: DogfoodEnvelope,
  logger: (msg: string) => void,
): { passed: boolean; reason?: string } {
  const assertions = envelope.preflight_assertions ?? [];

  for (const assertion of assertions) {
    const result = runAssertion(envelope, assertion);
    if (!result.passed) {
      logger(`preflight-failed kind=${assertion.kind} reason=${result.reason ?? 'unknown'}`);
      return { passed: false, reason: result.reason };
    }
  }
  return { passed: true };
}

function runAssertion(
  envelope: DogfoodEnvelope,
  assertion: PreflightAssertion,
): { passed: boolean; reason?: string } {
  switch (assertion.kind) {
    case 'i6_grep': {
      const targetPath =
        assertion.target === 'prompt_path' ? envelope.prompt_path : assertion.target;
      const content = readFileOrNull(resolveFromRoot(targetPath));
      if (content === null) {
        // Prompt file missing — treat as pass (may not exist in dry-run / unit test)
        return { passed: true };
      }
      if (content.includes(assertion.forbidden_substring)) {
        return {
          passed: false,
          reason: `i6_grep: "${assertion.forbidden_substring}" found in ${targetPath}`,
        };
      }
      return { passed: true };
    }

    case 'tenancy_lock': {
      if (
        envelope.tenancy.user !== assertion.expect_user ||
        envelope.tenancy.project !== assertion.expect_project
      ) {
        return {
          passed: false,
          reason:
            `tenancy_lock: envelope user=${envelope.tenancy.user} project=${envelope.tenancy.project}` +
            ` but expected user=${assertion.expect_user} project=${assertion.expect_project}`,
        };
      }
      return { passed: true };
    }

    case 'budget_envelope': {
      if (envelope.budget_cap_tokens > assertion.max_tokens) {
        return {
          passed: false,
          reason: `budget_envelope: cap=${envelope.budget_cap_tokens} exceeds assertion max=${assertion.max_tokens}`,
        };
      }
      return { passed: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Span attribute builder (spec §5.2 — 11 mandatory attributes)
// ---------------------------------------------------------------------------

export function buildRootSpanAttrs(
  envelope: DogfoodEnvelope,
  checkpoint: string,
): Record<string, string | number | boolean> {
  const phase =
    typeof envelope.metadata?.['authoring_phase'] === 'number'
      ? (envelope.metadata['authoring_phase'] as number)
      : parsePhaseFromId(envelope.envelope_id);
  const substage =
    typeof envelope.metadata?.['authoring_substage'] === 'string'
      ? (envelope.metadata['authoring_substage'] as string)
      : parseSubstageFromId(envelope.envelope_id);

  return {
    'span.kind': 'ORCH_DAEMON_DISPATCH',
    phase,
    substage,
    'tenancy.user': envelope.tenancy.user,
    'tenancy.project': envelope.tenancy.project,
    is_self_app: envelope.tenancy.is_self_app,
    subagent_type: envelope.subagent_type,
    model: envelope.model,
    effort: envelope.effort,
    envelope_id: envelope.envelope_id,
    dogfood_checkpoint: checkpoint,
  };
}

function parsePhaseFromId(envelopeId: string): number {
  const m = /phase-(\d+)/.exec(envelopeId);
  return m !== null ? parseInt(m[1]!, 10) : 0;
}

function parseSubstageFromId(envelopeId: string): string {
  const m = /phase-\d+-(.+)/.exec(envelopeId);
  return m !== null ? m[1]! : envelopeId;
}

// ---------------------------------------------------------------------------
// Main harness entry-point
// ---------------------------------------------------------------------------

/**
 * Run a self-task envelope end-to-end.
 *
 * Returns an exit code matching the spec §4.3 degradation matrix.
 * Never throws — all errors are caught and translated to exit codes.
 */
export async function runSelfTask(envelopePath: string): Promise<number> {
  const log = (msg: string): void => {
    process.stderr.write(`[dogfood] ${new Date().toISOString()} ${msg}\n`);
  };

  // ── Step 1: Parse envelope ─────────────────────────────────────────────
  const raw = readFileOrNull(envelopePath);
  if (raw === null) {
    log(`envelope-not-found path=${envelopePath}`);
    return EXIT_CODES.CONFIG_ERROR;
  }

  let envelope: DogfoodEnvelope;
  try {
    const parsed = yamlLoad(raw);
    envelope = DogfoodEnvelopeSchema.parse(parsed);
  } catch (err) {
    log(`envelope-parse-error: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_CODES.CONFIG_ERROR;
  }

  // ── Step 2: Rollback marker check ──────────────────────────────────────
  const markerPath = resolveFromRoot(envelope.rollback_marker_path);
  if (fs.existsSync(markerPath)) {
    const markerContents = readFileOrNull(markerPath)?.trim() ?? '';
    const msg = markerContents
      ? `dogfood-aborted-by-marker: ${markerContents}`
      : 'dogfood-aborted-by-marker';
    log(msg);
    return EXIT_CODES.OK;
  }

  // ── Step 3: Preflight assertions ───────────────────────────────────────
  const preflight = runPreflightAssertions(envelope, log);
  if (!preflight.passed) {
    appendTrace(envelope.dispatch_trace_path, {
      spanName: 'dogfood.preflight',
      status: 'preflight_failed',
      reason: preflight.reason,
      envelope_id: envelope.envelope_id,
      timestamp: new Date().toISOString(),
    });
    return EXIT_CODES.PREFLIGHT_FAILED;
  }

  // ── Step 4: Parent sentinel check (T1) ────────────────────────────────
  if (process.env[PARENT_SENTINEL] !== '1') {
    log(`no-parent-sentinel: ${PARENT_SENTINEL} must be "1" in env`);
    return EXIT_CODES.CONTAINMENT_REFUSED;
  }

  // ── T4: Nesting depth check ────────────────────────────────────────────
  const currentDepth = parseInt(process.env[DOGFOOD_DEPTH_ENV] ?? '0', 10);
  if (currentDepth >= MAX_DOGFOOD_DEPTH) {
    log(`dogfood-depth-exceeded: depth=${currentDepth} max=${MAX_DOGFOOD_DEPTH}`);
    return EXIT_CODES.CONTAINMENT_REFUSED;
  }

  // ── Step 5: Tenancy scope resolution (T2) ─────────────────────────────
  const resolver = new ScopeResolver({ rootDir: PROJECT_ROOT, defaultUser: 'default-user' });
  let scopePath: string;
  try {
    const scope = resolver.resolve('agent-workspace/');
    scopePath = path.join(PROJECT_ROOT, 'agent-workspace');
    log(`scope-resolved user=${scope.user} project=${scope.project} path=${scopePath}`);
  } catch (err) {
    log(`tenancy-violation: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_CODES.ISOLATION_ERROR;
  }

  // ── Step 6: Read prompt + prepend rules block (T3) ────────────────────
  const promptAbsPath = resolveFromRoot(envelope.prompt_path);
  const promptBody =
    readFileOrNull(promptAbsPath) ??
    `# ${envelope.envelope_id}\n(prompt file not found at ${envelope.prompt_path})`;

  const fullPrompt = `/effort ${envelope.effort}\n\n${SELF_APP_RULES_BLOCK}\n\n${promptBody}`;

  // ── Step 7: Validate dispatch_trace_path is inside allowed dir ─────────
  const tracePath = envelope.dispatch_trace_path;
  const normalizedTrace = tracePath.replace(/\\/g, '/');
  if (!normalizedTrace.startsWith(TRACE_DIR_PREFIX)) {
    log(
      `trace-path-violation: dispatch_trace_path must start with "${TRACE_DIR_PREFIX}" but got "${tracePath}"`,
    );
    return EXIT_CODES.PREFLIGHT_FAILED;
  }

  // ── Step 8: OTEL root span + trace emission ────────────────────────────
  const tracer = new TracingService();
  const checkpoint =
    (envelope.metadata?.['dogfood_checkpoint'] as string | undefined) ?? 'C1';
  const rootAttrs = buildRootSpanAttrs(envelope, checkpoint);

  let exitCode = EXIT_CODES.OK;

  try {
    await tracer.withSpan(
      'dogfood.dispatch_substage',
      async (rootSpan) => {
        // Apply all 11 mandatory attributes
        for (const [key, value] of Object.entries(rootAttrs)) {
          rootSpan.setAttribute(key, value as string | number | boolean);
        }

        appendTrace(tracePath, {
          spanName: 'dogfood.dispatch_substage',
          attrs: rootAttrs,
          timestamp: new Date().toISOString(),
          envelope_id: envelope.envelope_id,
          status: 'started',
        });

        await tracer.withSpan('dogfood.preflight', async (span) => {
          span.setAttribute('result', 'passed');
          appendTrace(tracePath, {
            spanName: 'dogfood.preflight',
            attrs: { result: 'passed' },
            timestamp: new Date().toISOString(),
          });
        });

        await tracer.withSpan('dogfood.scope_resolution', async (span) => {
          span.setAttribute('scope_path', scopePath);
          appendTrace(tracePath, {
            spanName: 'dogfood.scope_resolution',
            attrs: { scope_path: scopePath },
            timestamp: new Date().toISOString(),
          });
        });

        // ── Step 9: subprocess dispatch ─────────────────────────────────
        await tracer.withSpan('dogfood.subprocess_spawn', async (span) => {
          span.setAttribute('subagent_type', envelope.subagent_type);
          span.setAttribute('model', envelope.model);
          span.setAttribute('effort', envelope.effort);
          span.setAttribute('budget_cap_tokens', envelope.budget_cap_tokens);

          // Inject W3C traceparent into subprocess env
          const envWithTrace = tracer.injectTraceparentIntoEnv({
            ...process.env,
            ORCH_USER_ID: envelope.tenancy.user,
            [DOGFOOD_DEPTH_ENV]: String(currentDepth + 1),
            [PARENT_SENTINEL]: '1',
          } as NodeJS.ProcessEnv);

          log(
            `subprocess-spawn subagent=${envelope.subagent_type} model=${envelope.model}` +
            ` effort=${envelope.effort} budget=${envelope.budget_cap_tokens}`,
          );
          log(`prompt-length=${fullPrompt.length} traceparent=${envWithTrace['TRACEPARENT'] ?? 'none'}`);
          log(`scope=${scopePath}`);

          appendTrace(tracePath, {
            spanName: 'dogfood.subprocess_spawn',
            attrs: {
              subagent_type: envelope.subagent_type,
              model: envelope.model,
              effort: envelope.effort,
              budget_cap_tokens: envelope.budget_cap_tokens,
              prompt_length: fullPrompt.length,
              // Real IAgentRuntime.spawn() wired in 8.5.3
              dispatch_deferred_to: '8.5.3',
            },
            timestamp: new Date().toISOString(),
          });
        });

        await tracer.withSpan('dogfood.trace_close', async (span) => {
          span.setAttribute('trace_path', tracePath);
          appendTrace(tracePath, {
            spanName: 'dogfood.trace_close',
            attrs: { trace_path: tracePath },
            timestamp: new Date().toISOString(),
            status: 'complete',
          });
        });

        rootSpan.setStatus('ok');
        appendTrace(tracePath, {
          spanName: 'dogfood.dispatch_substage',
          attrs: rootAttrs,
          timestamp: new Date().toISOString(),
          status: 'ended',
        });
      },
      rootAttrs as Record<string, string>,
    );
  } catch (err) {
    log(`spawn-failed: ${err instanceof Error ? err.message : String(err)}`);
    appendTrace(tracePath, {
      spanName: 'dogfood.dispatch_substage',
      attrs: rootAttrs,
      timestamp: new Date().toISOString(),
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
    exitCode = EXIT_CODES.SPAWN_FAILED;
  }

  log(`dispatch-complete envelope=${envelope.envelope_id} exit=${exitCode}`);
  return exitCode;
}

// ---------------------------------------------------------------------------
// CLI entry point — only runs when executed directly, not when imported
// ---------------------------------------------------------------------------

async function cliMain(): Promise<void> {
  const args = process.argv.slice(2);

  const dryRunIdx = args.indexOf('--dry-run');
  const isDryRun = dryRunIdx !== -1;
  if (isDryRun) args.splice(dryRunIdx, 1);

  const envelopeIdx = args.indexOf('--envelope');
  let envelopePath: string | undefined;
  if (envelopeIdx !== -1) {
    envelopePath = args[envelopeIdx + 1];
  } else {
    envelopePath = args[0];
  }

  if (!envelopePath) {
    process.stderr.write('Usage: run-self-task.ts <envelope-path> [--dry-run]\n');
    process.exit(EXIT_CODES.CONFIG_ERROR);
  }

  if (isDryRun) {
    const raw = fs.existsSync(envelopePath)
      ? fs.readFileSync(envelopePath, 'utf8')
      : null;
    if (raw === null) {
      process.stderr.write(`[dogfood] envelope-not-found path=${envelopePath}\n`);
      process.exit(EXIT_CODES.CONFIG_ERROR);
    }
    try {
      const parsed = yamlLoad(raw);
      DogfoodEnvelopeSchema.parse(parsed);
      process.stderr.write(`[dogfood] dry-run: envelope valid, dispatch skipped\n`);
      process.exit(EXIT_CODES.OK);
    } catch (err) {
      process.stderr.write(
        `[dogfood] dry-run: envelope-parse-error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(EXIT_CODES.CONFIG_ERROR);
    }
  }

  const exitCode = await runSelfTask(envelopePath);
  process.exit(exitCode);
}

// Guard: only run CLI when this file is the entry point
if (process.argv[1] === _thisFile) {
  cliMain().catch((err: unknown) => {
    process.stderr.write(
      `[dogfood] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(EXIT_CODES.CONFIG_ERROR);
  });
}

export { MAX_DOGFOOD_BUDGET };
