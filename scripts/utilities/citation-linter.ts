// citation-linter.ts — Hallucination-guard linter. Decision 024. OQR-1 b (CF-25 deferred v2.3).
// DEFAULT --input: citation-lint recs md (^- ** must have "cites rollup row:"); contract: feedback-loop.spec.ts:98-109.
// ROLLUP  --rollup <path>: validate component-existence. --phase N infers rollup path.
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Claude Code built-in tool/event names — not custom scripts; exempt from missing-file check.
// Includes both hook event lifecycle names (PreToolUse, PostToolUse, SessionStart, etc.) and
// tool names that appear as the `name` field within those events (Bash, Read, WebFetch, etc.).
// CF-25 dedup: WebFetch and TaskList added v2.5 (Phase 10.2) — these are built-in Claude Code
// tool names that appear in component-rollup telemetry as hook rows but have no scripts/hooks/ file.
export const BUILTIN_HOOK_EVENTS: ReadonlySet<string> = new Set([
  'Bash','Read','Write','Edit','Grep','Glob','Agent','Task','TaskUpdate','TaskCreate',
  'TaskRead','TaskWrite','SessionStart','SessionEnd','ToolSearch','Skill','Stop','PreToolUse','PostToolUse',
  'WebFetch','TaskList',
]);
export const SENTINEL_NAMES: ReadonlySet<string> = new Set(['unknown-agent','unknown-command','unknown-skill','unknown-hook']);
export const COMPONENT_RESOLUTION_MAP: Record<string,(n:string)=>string> = { // Decision 024 verbatim
  skill:(n)=>`.claude/skills/${n}/SKILL.md`, agent:(n)=>`.claude/agents/${n}.md`,
  command:(n)=>`.claude/commands/${n}.md`,   hook:(n)=>`scripts/hooks/${n}.sh`,
};

export type RollupResolutionResult = {
  component_type:string; component_name:string;
  status:'PASS'|'FAIL'|'EXEMPT'|'EXEMPT_SENTINEL'|'UNKNOWN_TYPE'; expectedPath?:string;
};

// Default-mode linter — reimplementation of feedback-loop.spec.ts:98-109.
export function lintRecommendationsCitations(recsMd:string):{violations:string[]} {
  const violations:string[]=[]; let currentSection='';
  for (const line of recsMd.split('\n')) {
    if (line.match(/^## /)) currentSection=line;
    if (line.match(/^- \*\*/) && !line.includes('cites rollup row:')) violations.push(`${currentSection}: ${line.slice(0,80)}`);
  }
  return {violations};
}

// Rollup mode — resolution order: existsSync→PASS, builtin→EXEMPT, sentinel→EXEMPT_SENTINEL, else→FAIL.
export function lintRollupComponents(rollupMd:string, projectRoot:string):RollupResolutionResult[] {
  const results:RollupResolutionResult[]=[];
  for (const line of rollupMd.split('\n')) {
    const m=/^\| (skill|agent|command|hook) \| ([^|]+) \|/.exec(line);
    if (!m) continue;
    const component_type=m[1]!.trim(), component_name=m[2]!.trim();
    const resolver=COMPONENT_RESOLUTION_MAP[component_type];
    if (!resolver){results.push({component_type,component_name,status:'UNKNOWN_TYPE'});continue;}
    const expectedPath=resolver(component_name);
    if (existsSync(resolve(projectRoot,expectedPath))){results.push({component_type,component_name,status:'PASS',expectedPath});continue;}
    if (component_type==='hook'&&BUILTIN_HOOK_EVENTS.has(component_name)){results.push({component_type,component_name,status:'EXEMPT',expectedPath});continue;}
    if (SENTINEL_NAMES.has(component_name)){results.push({component_type,component_name,status:'EXEMPT_SENTINEL',expectedPath});continue;}
    results.push({component_type,component_name,status:'FAIL',expectedPath});
  }
  return results;
}

const HELP=`citation-linter.ts — Hallucination-guard linter
  --input <path>   Recommendations markdown (default mode, citation-lint)
  --rollup <path>  Component rollup markdown (rollup mode, component-existence)
  --phase N        Infer rollup: agent-workspace/memory/component-rollup-phase-N.md
  --help           Show this help
Decision 024: skill/.claude/skills/<n>/SKILL.md  agent/.claude/agents/<n>.md  command/.claude/commands/<n>.md  hook/scripts/hooks/<n>.sh`;

const {values}=parseArgs({args:process.argv.slice(2),
  options:{input:{type:'string'},rollup:{type:'string'},phase:{type:'string'},help:{type:'boolean',default:false}},strict:false});
if (values['help']){console.log(HELP);process.exit(0);}
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
let rollupPath=values['rollup'];
if (!rollupPath&&values['phase']) rollupPath=`agent-workspace/memory/component-rollup-phase-${values['phase']}.md`;
if (rollupPath){
  const abs=resolve(projectRoot,rollupPath);
  if (!existsSync(abs)){process.stderr.write(`ERROR: rollup file not found: ${abs}\n`);process.exit(1);}
  const results=lintRollupComponents(readFileSync(abs,'utf8'),projectRoot);
  if (results.length===0){console.log('OK: 0 component rows (empty rollup)');process.exit(0);}
  const fails=results.filter(r=>r.status==='FAIL');
  for (const r of fails) console.log(`FAIL  ${r.component_type}::${r.component_name} — expected: ${r.expectedPath??''}`);
  if (fails.length>0){process.stderr.write(`${fails.length} missing component(s).\n`);process.exit(1);}
  process.exit(0);
}
const inputPath=values['input'];
const md=inputPath?readFileSync(resolve(projectRoot,inputPath),'utf8'):readFileSync('/dev/stdin','utf8');
const {violations}=lintRecommendationsCitations(md);
if (violations.length>0){for (const v of violations) console.error(`VIOLATION: ${v}`);process.exit(1);}
console.log('OK: all citations present');process.exit(0);
