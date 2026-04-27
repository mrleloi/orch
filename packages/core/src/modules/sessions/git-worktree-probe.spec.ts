/**
 * git-worktree-probe.spec.ts — Unit tests for probeWorktreeSupport().
 *
 * I-13: execa is mocked — NO real git invocations.
 *
 * T1: successful probe (git exits 0, stdout present) → { supported: true }
 * T2: ENOENT (git not on PATH) → { supported: false, reason contains 'ENOENT' }
 * T3: empty stdout, exit 0 → { supported: true } (help output tolerant per Decision 018)
 */

// ── execa mock ────────────────────────────────────────────────────────────────
jest.mock('execa', () => {
  const mockExeca = jest.fn();
  return mockExeca;
});

import mockExecaImport from 'execa';
const mockExeca = mockExecaImport as jest.Mock;

import { probeWorktreeSupport } from './git-worktree-probe.js';

// ── Test suite ────────────────────────────────────────────────────────────────

describe('probeWorktreeSupport()', () => {
  beforeEach(() => {
    mockExeca.mockReset();
  });

  // ── T1: success ───────────────────────────────────────────────────────────

  it('T1: resolved execa with non-empty stdout and exit 0 → returns { supported: true }', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'usage: git worktree add [...]',
      stderr: '',
    });

    const result = await probeWorktreeSupport();

    expect(result.supported).toBe(true);
    expect(result.reason).toBeUndefined();

    // Verify the correct git command was issued (I-3)
    expect(mockExeca).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', '--help'],
      expect.objectContaining({ reject: false }),
    );
  });

  // ── T2: ENOENT ────────────────────────────────────────────────────────────

  it('T2: execa rejects with ENOENT (git not on PATH) → returns { supported: false, reason contains ENOENT }', async () => {
    mockExeca.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: git not found'), { code: 'ENOENT' }),
    );

    const result = await probeWorktreeSupport();

    expect(result.supported).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('ENOENT');
  });

  // ── T3: empty stdout, exit 0 → supported ─────────────────────────────────

  it('T3: execa resolves with empty stdout and exit 0 → returns { supported: true } (tolerant per Decision 018)', async () => {
    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    const result = await probeWorktreeSupport();

    // Help output is tolerant — any non-error exit (0) is treated as success
    expect(result.supported).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});
