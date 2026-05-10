import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitDiffService } from '../services/GitDiffService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

const NUL = '\x00';

describe('GitDiffService.compareRefs parser', () => {
  it('handles two-dot commit-vs-commit, parses status + numstat', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute').mockImplementation(async (opts) => {
      const cmd = opts.args.join(' ');
      if (cmd.startsWith('diff --name-status')) {
        // Two regular files: M and A
        return { success: true, value: { stdout: `M${NUL}src/foo.ts${NUL}A${NUL}src/bar.ts${NUL}`, stderr: '' } };
      }
      if (cmd.startsWith('diff --numstat')) {
        return { success: true, value: { stdout: `5\t3\tsrc/foo.ts${NUL}10\t0\tsrc/bar.ts${NUL}`, stderr: '' } };
      }
      if (cmd.startsWith('rev-parse')) {
        return { success: true, value: { stdout: opts.args[1] === 'aaaaaaa' ? 'a'.repeat(40) : 'b'.repeat(40), stderr: '' } };
      }
      return { success: true, value: { stdout: '', stderr: '' } };
    });

    const result = await service.compareRefs(
      { kind: 'commit', hash: 'aaaaaaa' },
      { kind: 'commit', hash: 'bbbbbbb' },
      'two-dot',
    );

    expect(executeSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.files).toHaveLength(2);
    expect(result.value.files[0]).toEqual(expect.objectContaining({ path: 'src/foo.ts', status: 'modified', additions: 5, deletions: 3 }));
    expect(result.value.files[1]).toEqual(expect.objectContaining({ path: 'src/bar.ts', status: 'added', additions: 10, deletions: 0 }));
    expect(result.value.stats).toEqual({ additions: 15, deletions: 3 });
    expect(result.value.mode).toBe('two-dot');
    expect(result.value.fellBackToTwoDot).toBe(false);
  });

  it('flags binary files (numstat -\\t-) by leaving additions/deletions unset', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockImplementation(async (opts) => {
      const cmd = opts.args.join(' ');
      if (cmd.startsWith('diff --name-status')) {
        return { success: true, value: { stdout: `M${NUL}assets/logo.png${NUL}`, stderr: '' } };
      }
      if (cmd.startsWith('diff --numstat')) {
        return { success: true, value: { stdout: `-\t-\tassets/logo.png${NUL}`, stderr: '' } };
      }
      return { success: true, value: { stdout: '', stderr: '' } };
    });

    const result = await service.compareRefs(
      { kind: 'commit', hash: 'a'.repeat(40) },
      { kind: 'commit', hash: 'b'.repeat(40) },
      'two-dot',
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.files[0].path).toBe('assets/logo.png');
    expect(result.value.files[0].status).toBe('modified');
    expect(result.value.files[0].additions).toBeUndefined();
    expect(result.value.files[0].deletions).toBeUndefined();
    expect(result.value.stats).toEqual({ additions: 0, deletions: 0 });
  });

  it('handles rename status (R100) with old + new paths', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockImplementation(async (opts) => {
      const cmd = opts.args.join(' ');
      if (cmd.startsWith('diff --name-status')) {
        return { success: true, value: { stdout: `R100${NUL}src/old.ts${NUL}src/new.ts${NUL}`, stderr: '' } };
      }
      if (cmd.startsWith('diff --numstat')) {
        return { success: true, value: { stdout: `0\t0\t${NUL}src/old.ts${NUL}src/new.ts${NUL}`, stderr: '' } };
      }
      return { success: true, value: { stdout: '', stderr: '' } };
    });

    const result = await service.compareRefs(
      { kind: 'commit', hash: 'a'.repeat(40) },
      { kind: 'commit', hash: 'b'.repeat(40) },
      'two-dot',
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.files[0]).toEqual(expect.objectContaining({
      path: 'src/new.ts',
      oldPath: 'src/old.ts',
      status: 'renamed',
    }));
  });

  it('falls back from three-dot to two-dot when no merge base exists', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockImplementation(async (opts) => {
      const cmd = opts.args.join(' ');
      if (cmd.startsWith('merge-base')) {
        return { success: false, error: { message: 'no merge base', code: 'COMMAND_FAILED', name: 'GitError', toJSON: () => ({}) } as never };
      }
      if (cmd.startsWith('diff --name-status')) {
        return { success: true, value: { stdout: '', stderr: '' } };
      }
      if (cmd.startsWith('diff --numstat')) {
        return { success: true, value: { stdout: '', stderr: '' } };
      }
      return { success: true, value: { stdout: '', stderr: '' } };
    });

    const result = await service.compareRefs(
      { kind: 'branch', name: 'main' },
      { kind: 'branch', name: 'orphan' },
      'three-dot',
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.fellBackToTwoDot).toBe(true);
    expect(result.value.mode).toBe('two-dot');
  });

  it('rejects three-dot with Working Tree (in either slot)', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const resultB = await service.compareRefs(
      { kind: 'head' },
      { kind: 'workingTree' },
      'three-dot',
    );
    expect(resultB.success).toBe(false);
    if (resultB.success) return;
    expect(resultB.error.code).toBe('VALIDATION_ERROR');

    const resultA = await service.compareRefs(
      { kind: 'workingTree' },
      { kind: 'head' },
      'three-dot',
    );
    expect(resultA.success).toBe(false);
    if (resultA.success) return;
    expect(resultA.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows Working Tree as slot A by inverting with -R (FR-018)', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const calls: string[][] = [];
    vi.spyOn(service['executor'], 'execute').mockImplementation(async (opts) => {
      calls.push(opts.args);
      return { success: true, value: { stdout: '', stderr: '' } };
    });
    const result = await service.compareRefs(
      { kind: 'workingTree' },
      { kind: 'head' },
      'two-dot',
    );
    expect(result.success).toBe(true);
    // Verify -R was used so the diff direction matches user intent (Base=WT → Target=ref).
    const diffCalls = calls.filter((args) => args[0] === 'diff');
    expect(diffCalls.length).toBeGreaterThan(0);
    for (const args of diffCalls) {
      expect(args).toContain('-R');
    }
  });

  it('rejects expression slots that begin with "-"', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const result = await service.compareRefs(
      { kind: 'expression', text: '-z' },
      { kind: 'head' },
      'two-dot',
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
