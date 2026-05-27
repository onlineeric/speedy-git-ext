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
      args: ['log', 'HEAD', '--branches', '--remotes', '--tags', '--format=%an%x00%ae'],
    }));
  });
});
