import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitRepoIdentityService } from '../services/GitRepoIdentityService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

function stdout(text: string) {
  return { success: true as const, value: { stdout: text, stderr: '' } };
}

describe('GitRepoIdentityService', () => {
  it('asks git for all three directories in one spawn', async () => {
    const service = new GitRepoIdentityService(mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue(
      stdout('/repos/a/.git\n/repos/a/.git\n/repos/a\n'),
    );

    const result = await service.resolve('/repos/a');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      args: ['rev-parse', '--absolute-git-dir', '--git-common-dir', '--show-toplevel'],
      cwd: '/repos/a',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual({
        repoPath: '/repos/a',
        gitDir: '/repos/a/.git',
        commonGitDir: '/repos/a/.git',
        topLevel: '/repos/a',
      });
    }
  });

  it('resolves a relative --git-common-dir against the git dir, not cwd', async () => {
    const service = new GitRepoIdentityService(mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue(
      stdout('/repos/a/.git/worktrees/feat\n../..\n/repos/a.worktrees/feat\n'),
    );

    const result = await service.resolve('/repos/a.worktrees/feat');
    expect(result.success && result.value.commonGitDir).toBe('/repos/a/.git');
  });

  it("resolves a plain repo's '.' common dir to the git dir itself", async () => {
    const service = new GitRepoIdentityService(mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue(
      stdout('/repos/a/.git\n.\n/repos/a\n'),
    );

    const result = await service.resolve('/repos/a');
    expect(result.success && result.value.commonGitDir).toBe('/repos/a/.git');
  });

  it('stores an empty topLevel for a bare repository', async () => {
    const service = new GitRepoIdentityService(mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue(stdout('/repos/bare.git\n.\n'));

    const result = await service.resolve('/repos/bare.git');
    expect(result.success && result.value.topLevel).toBe('');
  });

  it('caches, so a second resolve spawns nothing', async () => {
    const service = new GitRepoIdentityService(mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue(
      stdout('/repos/a/.git\n.\n/repos/a\n'),
    );

    await service.resolve('/repos/a');
    await service.resolve('/repos/a/');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(service.peek('/repos/a')?.gitDir).toBe('/repos/a/.git');
  });

  it('coalesces concurrent resolves of one path into a single spawn', async () => {
    const service = new GitRepoIdentityService(mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue(
      stdout('/repos/a/.git\n.\n/repos/a\n'),
    );

    const [first, second] = await Promise.all([service.resolve('/repos/a'), service.resolve('/repos/a')]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('passes a failure through and caches nothing', async () => {
    const service = new GitRepoIdentityService(mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('Not a git repository', 'NOT_A_REPOSITORY'),
    });

    const result = await service.resolve('/not/a/repo');
    expect(result.success).toBe(false);
    expect(service.peek('/not/a/repo')).toBeNull();

    await service.resolve('/not/a/repo');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty path without spawning', async () => {
    const service = new GitRepoIdentityService(mockLog);
    const spy = vi.spyOn(service['executor'], 'execute');

    const result = await service.resolve('');
    expect(result.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('invalidate drops the cached entry', async () => {
    const service = new GitRepoIdentityService(mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue(
      stdout('/repos/a/.git\n.\n/repos/a\n'),
    );

    await service.resolve('/repos/a');
    service.invalidate('/repos/a');
    await service.resolve('/repos/a');

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
