/**
 * session-self-reboot-parse.spec.ts -- Regression test for the auto-reboot pipeline.
 *
 * Bug origin (2026-04-26): scripts/session-self-reboot.ps1 contained UTF-8 em-dash
 * characters (U+2014, bytes 0xE2 0x80 0x94). PowerShell on Windows loads .ps1 files
 * using the local ANSI codepage (typically CP1252) by default, which interpreted
 * those bytes as garbage tokens. The script aborted with parser errors BEFORE
 * any SendKeys logic ran, never wrote .auto-reboot-FAILED, and the once-only
 * .wind-down-fired marker silently blocked all retries -- breaking auto-reboot
 * for the entire session. The user manually typed `continue` to recover, twice.
 *
 * This test guarantees the .ps1 files are parseable by PowerShell and contain no
 * non-ASCII characters that depend on encoding interpretation. CI fails if any
 * .ps1 in scripts/ or scripts/hooks/ regresses.
 *
 * The test is Windows-only because PowerShell parsing semantics + ANSI codepage
 * interaction is the specific failure mode. On non-Windows we skip; the bug
 * cannot manifest there.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

const WIN32 = process.platform === 'win32';

const PS_SCRIPTS = [
  resolve(REPO_ROOT, 'scripts', 'session-self-reboot.ps1'),
  resolve(REPO_ROOT, 'scripts', 'hooks', 'continue-injector.ps1'),
];

function parseCheckPowerShell(scriptPath: string): { ok: boolean; output: string } {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `try { $null = [scriptblock]::Create((Get-Content -Raw -Path '${scriptPath.replace(/'/g, "''")}')); 'PARSE_OK' } catch { 'PARSE_FAIL: ' + $_.Exception.Message }`,
    ],
    { encoding: 'utf8', timeout: 10_000 }
  );
  const output = (result.stdout || '').replace(/\r/g, '').split('\n').filter(Boolean)[0] ?? '';
  return { ok: output.startsWith('PARSE_OK'), output };
}

function findNonAscii(content: string): { line: number; char: string; codepoint: string }[] {
  const hits: { line: number; char: string; codepoint: string }[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      const cp = ch.codePointAt(0)!;
      if (cp > 0x7f) {
        hits.push({ line: i + 1, char: ch, codepoint: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0') });
      }
    }
  }
  return hits;
}

describe.skipIf(!WIN32)('session-self-reboot.ps1 -- parser + encoding regression', () => {
  it.each(PS_SCRIPTS)('PowerShell can parse %s without errors', (scriptPath) => {
    expect(existsSync(scriptPath), `expected ${scriptPath} to exist`).toBe(true);
    const { ok, output } = parseCheckPowerShell(scriptPath);
    expect(ok, `PowerShell parse check failed for ${scriptPath}: ${output}`).toBe(true);
  });

  it.each(PS_SCRIPTS)('contains no non-ASCII characters in %s (encoding-fragile -- always use ASCII)', (scriptPath) => {
    expect(existsSync(scriptPath), `expected ${scriptPath} to exist`).toBe(true);
    const content = readFileSync(scriptPath, 'utf8');
    const hits = findNonAscii(content);
    if (hits.length > 0) {
      const summary = hits.slice(0, 5).map((h) => `line ${h.line}: ${h.char} (${h.codepoint})`).join('\n  ');
      throw new Error(
        `Found ${hits.length} non-ASCII char(s) in ${scriptPath}. PowerShell on Windows reads .ps1 files in the ANSI codepage (CP1252) by default, which mangles UTF-8 bytes and breaks the parser. Use ASCII equivalents (e.g. -- for em-dash, ' for curly quote).\nFirst hits:\n  ${summary}`
      );
    }
    expect(hits.length).toBe(0);
  });

  it('SessionStart proactive parse-check guard exists in session-start-bootstrap.sh', () => {
    const bootstrap = readFileSync(
      resolve(REPO_ROOT, 'scripts', 'hooks', 'session-start-bootstrap.sh'),
      'utf8'
    );
    expect(bootstrap).toMatch(/proactive parse-check/i);
    expect(bootstrap).toMatch(/PARSE_FAIL/);
    expect(bootstrap).toMatch(/\.auto-reboot-FAILED/);
  });

  it('session-self-reboot.sh propagates non-zero PowerShell exit codes by writing .auto-reboot-FAILED', () => {
    const wrapper = readFileSync(resolve(REPO_ROOT, 'scripts', 'session-self-reboot.sh'), 'utf8');
    expect(wrapper).toMatch(/if ! powershell\.exe/);
    expect(wrapper).toMatch(/\.auto-reboot-FAILED/);
    expect(wrapper).toMatch(/EXIT=\$\?/);
  });
});
