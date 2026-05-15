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
  it('runs `git fetch <remote> <branch>:<branch>` with the 60s timeout, then sets upstream, and returns success', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.fastForwardFromRemote('origin', 'feature-x');

    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe('Fast-forward completed');
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

    await service.fastForwardFromRemote('origin', 'release/1.2.x');

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

    const result = await service.fastForwardFromRemote('origin', 'missing');

    expect(result.success).toBe(false);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces failures from the set-upstream step', async () => {
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

    const result = await service.fastForwardFromRemote('origin', 'feature-x');

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
});
