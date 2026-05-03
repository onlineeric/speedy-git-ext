import { describe, it, expect, vi } from 'vitest';
import type { LogOutputChannel } from 'vscode';
import { isDirtyWorkingTree } from '../utils/gitQueries.js';
import { GitExecutor } from '../services/GitExecutor.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('isDirtyWorkingTree', () => {
  it('returns false when status --porcelain output is empty', async () => {
    const executor = new GitExecutor(mockLog);
    vi.spyOn(executor, 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await isDirtyWorkingTree(executor, '/repo');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(false);
  });

  it('returns false for whitespace-only status output', async () => {
    const executor = new GitExecutor(mockLog);
    vi.spyOn(executor, 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '   \n  ', stderr: '' },
    });

    const result = await isDirtyWorkingTree(executor, '/repo');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(false);
  });

  it('returns true when there are tracked file modifications', async () => {
    const executor = new GitExecutor(mockLog);
    vi.spyOn(executor, 'execute').mockResolvedValue({
      success: true,
      value: { stdout: ' M src/foo.ts\n', stderr: '' },
    });

    const result = await isDirtyWorkingTree(executor, '/repo');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(true);
  });

  it('returns true when there are untracked files', async () => {
    const executor = new GitExecutor(mockLog);
    vi.spyOn(executor, 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '?? new-file.txt\n', stderr: '' },
    });

    const result = await isDirtyWorkingTree(executor, '/repo');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(true);
  });

  it('passes through underlying executor errors', async () => {
    const executor = new GitExecutor(mockLog);
    vi.spyOn(executor, 'execute').mockResolvedValue({
      success: false,
      error: new GitError('repo missing', 'NOT_A_REPOSITORY'),
    });

    const result = await isDirtyWorkingTree(executor, '/missing');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_A_REPOSITORY');
  });

  it('invokes git status --porcelain with the supplied workspace path', async () => {
    const executor = new GitExecutor(mockLog);
    const spy = vi.spyOn(executor, 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await isDirtyWorkingTree(executor, '/some/repo');
    expect(spy).toHaveBeenCalledWith({
      args: ['status', '--porcelain'],
      cwd: '/some/repo',
    });
  });
});
