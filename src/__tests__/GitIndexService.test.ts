import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitIndexService } from '../services/GitIndexService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitIndexService.stageFiles', () => {
  it('builds git add -- args', async () => {
    const service = new GitIndexService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.stageFiles(['a.ts', 'src/b.ts']);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['add', '--', 'a.ts', 'src/b.ts'],
    }));
  });
});

describe('GitIndexService.unstageFiles', () => {
  it('builds git reset HEAD -- args', async () => {
    const service = new GitIndexService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.unstageFiles(['a.ts']);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['reset', 'HEAD', '--', 'a.ts'],
    }));
  });
});

describe('GitIndexService.stageAll / unstageAll', () => {
  it('stageAll runs git add -A', async () => {
    const service = new GitIndexService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.stageAll();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['add', '-A'],
    }));
  });

  it('unstageAll runs git reset HEAD', async () => {
    const service = new GitIndexService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.unstageAll();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['reset', 'HEAD'],
    }));
  });
});

describe('GitIndexService.discardFiles', () => {
  it('runs only checkout when includeUntracked is false and checkout succeeds', async () => {
    const service = new GitIndexService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.discardFiles(['a.ts'], false);
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].args).toEqual(['checkout', '--', 'a.ts']);
  });

  it('also runs git clean when includeUntracked is true', async () => {
    const service = new GitIndexService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.discardFiles(['a.ts'], true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0].args).toEqual(['checkout', '--', 'a.ts']);
    expect(spy.mock.calls[1][0].args).toEqual(['clean', '-f', '--', 'a.ts']);
  });

  it('returns success when checkout fails but clean succeeds (all files were untracked)', async () => {
    const service = new GitIndexService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        success: false,
        error: new GitError('checkout failed', 'COMMAND_FAILED'),
      })
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: '', stderr: '' },
      });

    const result = await service.discardFiles(['untracked.txt'], true);
    expect(result.success).toBe(true);
  });

  it('propagates checkout error when includeUntracked is false', async () => {
    const service = new GitIndexService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('boom', 'COMMAND_FAILED'),
    });

    const result = await service.discardFiles(['a.ts'], false);
    expect(result.success).toBe(false);
  });
});

describe('GitIndexService.discardAllUnstaged', () => {
  it('runs checkout . then clean -fd', async () => {
    const service = new GitIndexService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.discardAllUnstaged();
    expect(spy.mock.calls[0][0].args).toEqual(['checkout', '--', '.']);
    expect(spy.mock.calls[1][0].args).toEqual(['clean', '-fd']);
  });

  it('returns checkout error if checkout fails', async () => {
    const service = new GitIndexService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('cannot checkout', 'COMMAND_FAILED'),
    });

    const result = await service.discardAllUnstaged();
    expect(result.success).toBe(false);
  });
});
