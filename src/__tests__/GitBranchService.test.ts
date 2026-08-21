import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitBranchService } from '../services/GitBranchService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitBranchService.deleteBranch', () => {
  it('classifies unmerged branch deletion failures so the UI can request force confirmation', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const { GitError } = await import('../../shared/errors.js');

    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError(
        'Git command failed with code 1',
        'COMMAND_FAILED',
        'git branch -d dev',
        "error: the branch 'dev' is not fully merged."
      ),
    });

    const result = await service.deleteBranch('dev');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('BRANCH_NOT_FULLY_MERGED');
    }
  });

  it('uses force deletion when explicitly requested', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.deleteBranch('dev', true);
    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['branch', '-D', 'dev'] })
    );
  });
});

describe('GitBranchService.fastForwardFromRemote', () => {
  it('runs only `git fetch <remote> <branch>:<branch>` with the 60s timeout when setUpstream is not requested', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.fastForwardFromRemote('origin', 'feature-x');

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe('Fast-forward completed');
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenNthCalledWith(1, {
      args: ['fetch', 'origin', 'feature-x:feature-x'],
      cwd: '/repo',
      timeout: 60000,
    });
  });

  it('also sets upstream when setUpstream=true (new-branch-from-remote-only-badge path)', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.fastForwardFromRemote('origin', 'feature-x', true);

    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(executeSpy).toHaveBeenNthCalledWith(1, {
      args: ['fetch', 'origin', 'feature-x:feature-x'],
      cwd: '/repo',
      timeout: 60000,
    });
    expect(executeSpy).toHaveBeenNthCalledWith(2, {
      args: ['branch', '--set-upstream-to=origin/feature-x', 'feature-x'],
      cwd: '/repo',
    });
  });

  it('preserves slashes in branch names (e.g. release/1.2.x)', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.fastForwardFromRemote('origin', 'release/1.2.x', true);

    expect(executeSpy).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ args: ['fetch', 'origin', 'release/1.2.x:release/1.2.x'] })
    );
    expect(executeSpy).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ args: ['branch', '--set-upstream-to=origin/release/1.2.x', 'release/1.2.x'] })
    );
  });

  it('does not attempt to set upstream when the fetch fails', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const { GitError } = await import('../../shared/errors.js');

    const executeSpy = vi.spyOn(service['executor'], 'execute').mockResolvedValueOnce({
      success: false,
      error: new GitError(
        'Git command failed with code 1',
        'COMMAND_FAILED',
        'git fetch origin missing:missing',
        "fatal: couldn't find remote ref missing"
      ),
    });

    const result = await service.fastForwardFromRemote('origin', 'missing', true);

    expect(result.success).toBe(false);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces failures from the set-upstream step when setUpstream=true', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const { GitError } = await import('../../shared/errors.js');

    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
      .mockResolvedValueOnce({
        success: false,
        error: new GitError(
          'Git command failed with code 1',
          'COMMAND_FAILED',
          'git branch --set-upstream-to=origin/feature-x feature-x',
          "error: the requested upstream branch 'origin/feature-x' does not exist"
        ),
      });

    const result = await service.fastForwardFromRemote('origin', 'feature-x', true);

    expect(result.success).toBe(false);
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects shell-metachar remote names without invoking the executor', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute');

    const result = await service.fastForwardFromRemote('-rf', 'feature-x');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('rejects shell-metachar branch names without invoking the executor', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute');

    const result = await service.fastForwardFromRemote('origin', '--upload-pack=evil');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('passes through executor failures (e.g. non-fast-forward) without rewriting the message', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const { GitError } = await import('../../shared/errors.js');

    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError(
        'Git command failed with code 1',
        'COMMAND_FAILED',
        'git fetch origin feature-x:feature-x',
        '! [rejected]   feature-x -> feature-x (non-fast-forward)'
      ),
    });

    const result = await service.fastForwardFromRemote('origin', 'feature-x');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('COMMAND_FAILED');
      expect(result.error.stderr).toContain('non-fast-forward');
    }
  });

  it('rejects "HEAD" as a branch name without invoking the executor', async () => {
    // Guards against `git fetch <remote> HEAD:HEAD` ever being able to create a
    // stray `refs/heads/HEAD`. Even if a UI badge slips through filtering, the
    // service refuses the write.
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute');

    const result = await service.fastForwardFromRemote('origin', 'HEAD');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe('GitBranchService reserved-name guards', () => {
  it('createBranch refuses "HEAD" as the new branch name', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute');

    const result = await service.createBranch('HEAD');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('renameBranch refuses "HEAD" as the new branch name', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute');

    const result = await service.renameBranch('feature-x', 'HEAD');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe('GitBranchService.merge', () => {
  const ok = { success: true as const, value: { stdout: '', stderr: '' } };

  function makeService() {
    const service = new GitBranchService('/repo', mockLog);
    return { service, execute: vi.spyOn(service['executor'], 'execute') };
  }

  it('merges any commit-ish, not just a branch name', async () => {
    const { service, execute } = makeService();
    execute.mockResolvedValue(ok);

    for (const ref of ['feature-x', 'origin/feature-x', 'v1.2.0', 'a1b2c3d4e5f6']) {
      const result = await service.merge(ref);
      expect(result.success).toBe(true);
      expect(execute).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['merge', ref] })
      );
    }
  });

  it('orders the option flags ahead of the ref', async () => {
    const { service, execute } = makeService();
    execute.mockResolvedValue(ok);

    await service.merge('feature-x', false, true, true);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['merge', '--no-commit', '--no-ff', '--squash', 'feature-x'] })
    );
  });

  it('reports a conflict that wrote MERGE_HEAD as recoverable', async () => {
    const { service, execute } = makeService();
    const { GitError } = await import('../../shared/errors.js');
    execute.mockImplementation(async ({ args }) =>
      args[0] === 'rev-parse'
        ? ok
        : { success: false, error: new GitError('failed', 'COMMAND_FAILED', 'git merge x', 'CONFLICT (content): Merge conflict in a.txt') }
    );

    const result = await service.merge('feature-x');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('MERGE_CONFLICT');
  });

  it('reports a conflict with no MERGE_HEAD — a squash merge — as unrecoverable', async () => {
    const { service, execute } = makeService();
    const { GitError } = await import('../../shared/errors.js');
    execute.mockImplementation(async ({ args }) =>
      args[0] === 'rev-parse'
        ? { success: false, error: new GitError('no MERGE_HEAD', 'COMMAND_FAILED') }
        : { success: false, error: new GitError('failed', 'COMMAND_FAILED', 'git merge --squash x', 'CONFLICT (content): Merge conflict in a.txt') }
    );

    const result = await service.merge('feature-x', false, true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('MERGE_CONFLICT_NO_RECOVERY');
  });

  it('passes a non-conflict failure through untouched', async () => {
    const { service, execute } = makeService();
    const { GitError } = await import('../../shared/errors.js');
    const original = new GitError('merge: nope - not something we can merge', 'COMMAND_FAILED');
    execute.mockImplementation(async ({ args }) =>
      args[0] === 'rev-parse' ? { success: false, error: new GitError('no MERGE_HEAD', 'COMMAND_FAILED') } : { success: false, error: original }
    );

    const result = await service.merge('nope');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe(original);
  });

  it('accepts the prepared merge message instead of waiting on an editor', async () => {
    const { service, execute } = makeService();
    execute.mockResolvedValue(ok);

    await service.continueMerge();

    // The no-op editor itself comes from GitExecutor (see its own test); this only
    // guards against a future env here shadowing it.
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ args: ['merge', '--continue'] }));
    expect(execute.mock.calls[0][0].env).toBeUndefined();
  });

  it('reads MERGE_HEAD as the merge-in-progress signal', async () => {
    const { service, execute } = makeService();
    const { GitError } = await import('../../shared/errors.js');

    execute.mockResolvedValue(ok);
    expect(await service.getMergeState()).toEqual({ success: true, value: 'in-progress' });

    execute.mockResolvedValue({ success: false, error: new GitError('x', 'COMMAND_FAILED') });
    expect(await service.getMergeState()).toEqual({ success: true, value: 'idle' });
  });
});
