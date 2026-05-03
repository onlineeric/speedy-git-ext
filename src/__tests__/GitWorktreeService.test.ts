import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitWorktreeService } from '../services/GitWorktreeService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitWorktreeService.listWorktrees', () => {
  it('parses standard worktree porcelain output', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [
          'worktree /repo',
          'HEAD aaaa1111',
          'branch refs/heads/main',
          '',
          'worktree /repo/feature',
          'HEAD bbbb2222',
          'branch refs/heads/feature',
        ].join('\n'),
        stderr: '',
      },
    });

    const result = await service.listWorktrees();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toEqual({
        path: '/repo',
        head: 'aaaa1111',
        branch: 'refs/heads/main',
        isMain: true,
        isDetached: false,
      });
      expect(result.value[1].isMain).toBe(false);
    }
  });

  it('marks detached worktrees', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [
          'worktree /repo',
          'HEAD aaaa1111',
          'detached',
        ].join('\n'),
        stderr: '',
      },
    });

    const result = await service.listWorktrees();
    if (result.success) {
      expect(result.value[0].isDetached).toBe(true);
      expect(result.value[0].branch).toBe('');
    }
  });

  it('returns empty array on empty output', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.listWorktrees();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([]);
  });

  it('returns empty array (success) when git worktree list fails', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('cmd not found', 'COMMAND_FAILED'),
    });

    const result = await service.listWorktrees();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([]);
  });
});
