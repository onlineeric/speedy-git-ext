import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitLogService } from '../services/GitLogService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitLogService.getCommits', () => {
  it('passes selected branches as revisions before the revision-path separator', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getCommits({ branches: ['main', 'origin/feature'], maxCount: 50 });

    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        'log',
        '--max-count=50',
        '--format=%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D',
        '--date-order',
        'main',
        'origin/feature',
        '--',
      ],
    }));
  });

  it('uses HEAD and user-facing ref namespaces when no branch filter is active', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getCommits({ maxCount: 25 });

    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        'log',
        '--ignore-missing',
        '--max-count=25',
        '--format=%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D',
        '--date-order',
        'HEAD',
        '--branches',
        '--remotes',
        '--tags',
        '--',
      ],
    }));
  });

  it('fetches authors from user-facing ref namespaces', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getAuthors();

    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['log', '--ignore-missing', 'HEAD', '--branches', '--remotes', '--tags', '--format=%an%x00%ae'],
    }));
  });
});

describe('GitLogService.getHeadCommitHash', () => {
  it('returns the trimmed hash from rev-parse HEAD', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: 'abc123def456\n', stderr: '' } });

    const result = await service.getHeadCommitHash();

    expect(result).toEqual({ success: true, value: 'abc123def456' });
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['rev-parse', 'HEAD'],
    }));
  });

  it('propagates failure when HEAD cannot be resolved (unborn branch)', async () => {
    const service = new GitLogService('/repo', mockLog);
    const error = { success: false as const, error: { message: 'unknown revision', code: 'UNKNOWN' } };
    vi.spyOn(service['executor'], 'execute').mockResolvedValue(error as never);

    const result = await service.getHeadCommitHash();

    expect(result.success).toBe(false);
  });
});

describe('GitLogService.getCommitPosition', () => {
  it('walks the same ordered stream as getCommits (hash-only format, capped depth)', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: 'aaa\nbbb\nccc\n', stderr: '' } });

    const result = await service.getCommitPosition('ccc');

    expect(result).toEqual({ success: true, value: 2 });
    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        'log',
        '--ignore-missing',
        '--max-count=100000',
        '--format=%H',
        '--date-order',
        'HEAD',
        '--branches',
        '--remotes',
        '--tags',
        '--',
      ],
    }));
  });

  it('applies the same branch and date filters as the paginated log', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: 'aaa\n', stderr: '' } });

    await service.getCommitPosition('aaa', { branches: ['main'], afterDate: '2026-01-01', beforeDate: '2026-02-01' });

    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        'log',
        '--max-count=100000',
        '--format=%H',
        '--date-order',
        '--after=2026-01-01',
        '--before=2026-02-01',
        'main',
        '--',
      ],
    }));
  });

  it('returns -1 when the commit is not in the stream', async () => {
    const service = new GitLogService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: 'aaa\nbbb\n', stderr: '' } });

    const result = await service.getCommitPosition('zzz');

    expect(result).toEqual({ success: true, value: -1 });
  });
});
