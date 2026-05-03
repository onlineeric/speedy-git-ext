import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitStashService } from '../services/GitStashService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

const NUL = '\x00';

describe('GitStashService.getStashes', () => {
  it('parses stash list output into StashEntry[]', async () => {
    const service = new GitStashService('/repo', mockLog);
    const line = [
      'aaaaaaa',                        // hash
      'parent1 parent2',                // parents (first only used)
      'stash@{0}',                      // reflog selector
      'WIP on main: hello',             // message
      '2024-04-15T12:00:00Z',           // ISO date
      'Eric',                           // author
      'eric@example.com',               // email
    ].join(NUL);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: line + '\n', stderr: '' },
    });

    const result = await service.getStashes();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        index: 0,
        hash: 'aaaaaaa',
        parentHash: 'parent1',
        message: 'WIP on main: hello',
        author: 'Eric',
        authorEmail: 'eric@example.com',
      });
      expect(typeof result.value[0].date).toBe('number');
    }
  });

  it('returns empty array when there are no stashes', async () => {
    const service = new GitStashService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.getStashes();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([]);
  });

  it('skips malformed lines without a stash{N} index', async () => {
    const service = new GitStashService('/repo', mockLog);
    const goodLine = ['aaa', 'p', 'stash@{0}', 'msg', '2024-01-01T00:00:00Z', 'A', 'a@x'].join(NUL);
    const badLine = ['bbb', 'p', 'NOT-A-STASH', 'msg', '2024-01-01T00:00:00Z', 'A', 'a@x'].join(NUL);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: `${goodLine}\n${badLine}\n`, stderr: '' },
    });

    const result = await service.getStashes();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toHaveLength(1);
  });
});

describe('GitStashService.applyStash / popStash / dropStash', () => {
  it('applyStash builds stash apply args', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.applyStash(2);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['stash', 'apply', 'stash@{2}'],
    }));
  });

  it('popStash builds stash pop args', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.popStash(0);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['stash', 'pop', 'stash@{0}'],
    }));
  });

  it('dropStash builds stash drop args', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.dropStash(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['stash', 'drop', 'stash@{1}'],
    }));
  });

  it('rejects negative or non-integer stash indices', async () => {
    const service = new GitStashService('/repo', mockLog);
    expect((await service.applyStash(-1)).success).toBe(false);
    expect((await service.popStash(1.5)).success).toBe(false);
    expect((await service.dropStash(NaN)).success).toBe(false);
  });
});

describe('GitStashService.stashWithMessage', () => {
  it('always includes --include-untracked', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.stashWithMessage();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['stash', 'push', '--include-untracked'],
    }));
  });

  it('passes -m message when provided', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.stashWithMessage('quick fix');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['stash', 'push', '--include-untracked', '-m', 'quick fix'],
    }));
  });

  it('appends -- and explicit paths when provided', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.stashWithMessage('partial', ['src/a.ts', 'src/b.ts']);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['stash', 'push', '--include-untracked', '-m', 'partial', '--', 'src/a.ts', 'src/b.ts'],
    }));
  });
});

describe('GitStashService.stashSelected', () => {
  it('rejects empty path list', async () => {
    const service = new GitStashService('/repo', mockLog);
    const result = await service.stashSelected('msg', [], false);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('runs git add then git stash push when addUntrackedFirst=true', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // add
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }); // stash push

    const result = await service.stashSelected('msg', ['new.txt'], true);
    expect(result.success).toBe(true);
    expect(spy.mock.calls[0][0].args).toEqual(['add', '--', 'new.txt']);
    expect(spy.mock.calls[1][0].args).toEqual(['stash', 'push', '-m', 'msg', '--', 'new.txt']);
  });

  it('skips git add when addUntrackedFirst=false', async () => {
    const service = new GitStashService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

    await service.stashSelected('m', ['a.ts'], false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].args).toEqual(['stash', 'push', '-m', 'm', '--', 'a.ts']);
  });

  it('returns augmented error when git add succeeded but stash push failed', async () => {
    const service = new GitStashService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // add
      .mockResolvedValueOnce({
        success: false,
        error: new GitError('boom', 'COMMAND_FAILED'),
      });

    const result = await service.stashSelected('m', ['new.txt'], true);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('git add succeeded');
      expect(result.error.message).toContain('staged');
    }
  });

  it('returns add error verbatim when git add fails', async () => {
    const service = new GitStashService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValueOnce({
      success: false,
      error: new GitError('add failed', 'COMMAND_FAILED'),
    });

    const result = await service.stashSelected('m', ['x.ts'], true);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toBe('add failed');
  });
});
