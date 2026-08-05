import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitLogService } from '../services/GitLogService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

/** Answer `git stash list` with `stashOutput`; every other command with empty output. */
async function stubStashList(args: readonly string[], stashOutput: string) {
  return { success: true as const, value: { stdout: args[0] === 'stash' ? stashOutput : '', stderr: '' } };
}

/** Arguments of the `git log` call recorded by an `execute` spy. */
function logArgsOf(spy: { mock: { calls: unknown[][] } }): string[] {
  for (const [options] of spy.mock.calls) {
    const args = (options as { args?: string[] }).args ?? [];
    if (args[0] === 'log') return args;
  }
  return [];
}

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
        '--decorate=full',
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
        '--decorate=full',
        '--date-order',
        'HEAD',
        '--branches',
        '--remotes',
        '--tags',
        '--',
      ],
    }));
  });

  it('walks stash base commits so a stash outlives the branch it was taken from', async () => {
    // After a rebase the old branch tip can be reachable only through refs/stash.
    // Without it in the walk its row vanishes, and the stash drawn against it with it.
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockImplementation(async ({ args }) => stubStashList(args, 'orphanedTip indexSnapshot untrackedSnapshot\n'));

    await service.getCommits({ maxCount: 25 });

    expect(executeSpy).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.arrayContaining(['HEAD', '--branches', '--remotes', '--tags', 'orphanedTip']),
    }));
    // Index and untracked snapshots are stash internals, not history.
    expect(logArgsOf(executeSpy)).not.toContain('indexSnapshot');
    expect(logArgsOf(executeSpy)).not.toContain('untrackedSnapshot');
  });

  it('lists each stash base once when several stashes share one base', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockImplementation(async ({ args }) =>
        stubStashList(args, 'sharedBase idxA unA\nsharedBase idxB unB\notherBase idxC unC\n'));

    await service.getCommits({ maxCount: 25 });

    const revisions = logArgsOf(executeSpy);
    expect(revisions.filter((arg) => arg === 'sharedBase')).toHaveLength(1);
    expect(revisions).toContain('otherBase');
  });

  it('omits stash bases when a branch filter narrows the graph to chosen refs', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockImplementation(async ({ args }) => stubStashList(args, 'orphanedTip idx un\n'));

    await service.getCommits({ branches: ['main'], maxCount: 25 });

    expect(logArgsOf(executeSpy)).not.toContain('orphanedTip');
    expect(executeSpy).not.toHaveBeenCalledWith(expect.objectContaining({
      args: ['stash', 'list', '--format=%P'],
    }));
  });

  it('still returns commits when the stash listing fails', async () => {
    const service = new GitLogService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockImplementation(async ({ args }) =>
      args[0] === 'stash'
        ? { success: false as const, error: { message: 'no stash reflog', code: 'UNKNOWN' } as never }
        : { success: true as const, value: { stdout: '', stderr: '' } });

    const result = await service.getCommits({ maxCount: 25 });

    expect(result.success).toBe(true);
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

  it('walks stash bases too, so every author the graph shows is offered as a filter', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockImplementation(async ({ args }) => stubStashList(args, 'orphanedTip idx un\n'));

    await service.getAuthors();

    expect(logArgsOf(executeSpy)).toEqual([
      'log', '--ignore-missing', 'HEAD', '--branches', '--remotes', '--tags', 'orphanedTip', '--format=%an%x00%ae',
    ]);
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
    // Command-specific: an empty `stash list` keeps this case about the base walk alone.
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockImplementation(async ({ args }) =>
        ({ success: true as const, value: { stdout: args[0] === 'stash' ? '' : 'aaa\nbbb\nccc\n', stderr: '' } }));

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

  it('includes stash bases too, so positions match the paginated log exactly', async () => {
    const service = new GitLogService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockImplementation(async ({ args }) => stubStashList(args, 'orphanedTip idx un\n'));

    await service.getCommitPosition('orphanedTip');

    expect(logArgsOf(executeSpy)).toEqual([
      'log',
      '--ignore-missing',
      '--max-count=100000',
      '--format=%H',
      '--date-order',
      'HEAD',
      '--branches',
      '--remotes',
      '--tags',
      'orphanedTip',
      '--',
    ]);
  });

  it('returns -1 when the commit is not in the stream', async () => {
    const service = new GitLogService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: 'aaa\nbbb\n', stderr: '' } });

    const result = await service.getCommitPosition('zzz');

    expect(result).toEqual({ success: true, value: -1 });
  });
});
