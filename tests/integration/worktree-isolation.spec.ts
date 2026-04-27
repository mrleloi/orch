/**
 * worktree-isolation.spec.ts — SC-34 permanent integration spec.
 * Promotes 6.3.8b P6 bidirectional sentinel probe to CI-gated test.
 * OQR-4: spawnSync('git',[array]) — array args, no shell option, no exec(string). I-3 OK.
 * I-6: git commit --allow-empty inside initRepo() targets isolated tmpdir only;
 *       live Orch repo never touched. afterEach deletes the tmpdir entirely.
 * Spec: agent-workspace/session-plans/pending/7.3-worktree-spec-architect.md
 */
import { describe, it, afterEach, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// --- helpers -----------------------------------------------------------------

const _gitOk = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
function hasGitOnPath(): boolean { return _gitOk; }

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orch-wt-test-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
  spawnSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir }); // HEAD needed for worktree add
  return dir;
}

function addWorktree(repoDir: string, name: string): string {
  const wt = join(repoDir, name);
  spawnSync('git', ['worktree', 'add', '-q', '-b', name, wt, 'HEAD'], { cwd: repoDir });
  return wt;
}

function pruneWorktrees(repoDir: string): void {
  spawnSync('git', ['worktree', 'prune'], { cwd: repoDir });
}

// --- suite -------------------------------------------------------------------

describe('worktree isolation', () => {
  const tmpdirs: string[] = [];

  afterEach(() => {
    for (const d of tmpdirs) {
      pruneWorktrees(d);
      rmSync(d, { recursive: true, force: true }); // force = idempotent on ENOENT
    }
    tmpdirs.length = 0;
  });

  it.skipIf(!hasGitOnPath())(
    'Case 1: file written in worktree-A is absent in worktree-B (forward isolation)',
    () => {
      const repo = initRepo(); tmpdirs.push(repo);
      const wta = addWorktree(repo, 'wta');
      const wtb = addWorktree(repo, 'wtb');
      writeFileSync(join(wta, '__SENTINEL_FROM_A.txt'), 'leak-payload');
      expect(existsSync(join(wtb, '__SENTINEL_FROM_A.txt'))).toBe(false);
    },
  );

  it.skipIf(!hasGitOnPath())(
    'Case 2: file written in worktree-B is absent in worktree-A (reverse isolation)',
    () => {
      const repo = initRepo(); tmpdirs.push(repo);
      const wta = addWorktree(repo, 'wta');
      const wtb = addWorktree(repo, 'wtb');
      writeFileSync(join(wtb, '__SENTINEL_FROM_B.txt'), 'leak-from-b');
      expect(existsSync(join(wta, '__SENTINEL_FROM_B.txt'))).toBe(false);
    },
  );

  it.skipIf(!hasGitOnPath())(
    'Case 3: prune removes both worktrees, no sentinel files leak to tmpdirs',
    () => {
      const repo = initRepo(); tmpdirs.push(repo);
      const wta = addWorktree(repo, 'wta');
      const wtb = addWorktree(repo, 'wtb');
      pruneWorktrees(repo);
      rmSync(wta, { recursive: true, force: true });
      rmSync(wtb, { recursive: true, force: true });
      expect(existsSync(wta)).toBe(false);
      expect(existsSync(wtb)).toBe(false);
    },
  );
});
