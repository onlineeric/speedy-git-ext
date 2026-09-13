import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitRebaseService } from '../services/GitRebaseService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import * as fs from 'fs';

describe('GitRebaseService.getRebaseState', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
  });

  it('returns idle when neither rebase-merge nor rebase-apply exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const service = new GitRebaseService('/repo', mockLog);
    const result = service.getRebaseState();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.state).toBe('idle');
  });

  it('returns in-progress with conflictInfo when stopped-sha can be read', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('aaa1111\n' as never);

    const service = new GitRebaseService('/repo', mockLog);
    const result = service.getRebaseState();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.state).toBe('in-progress');
      expect(result.value.conflictInfo?.conflictCommitHash).toBe('aaa1111');
    }
  });

  it('returns in-progress without conflictInfo when stopped-sha read fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const service = new GitRebaseService('/repo', mockLog);
    const result = service.getRebaseState();
    if (result.success) {
      expect(result.value.state).toBe('in-progress');
      expect(result.value.conflictInfo).toBeUndefined();
    }
  });
});

describe('GitRebaseService.getRebaseCommits', () => {
  it('rejects invalid base hashes', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const result = await service.getRebaseCommits('not-a-hash');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('parses NUL-delimited log output into RebaseEntry[] with default action="pick"', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [
          'aaa1111\x1faaa1111\x1ffirst\x1ffirst\n',
          'bbb2222\x1fbbb2222\x1fsecond\x1fsecond\n',
        ].join('\0') + '\0',
        stderr: '',
      },
    });

    const result = await service.getRebaseCommits('abc1234');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual([
        { hash: 'aaa1111', abbreviatedHash: 'aaa1111', subject: 'first', message: 'first', action: 'pick' },
        { hash: 'bbb2222', abbreviatedHash: 'bbb2222', subject: 'second', message: 'second', action: 'pick' },
      ]);
    }
  });

  it('reads the full message, not the subject: bodies, comment lines and trailers survive', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const fullMessage = [
      'Add the widget',
      '',
      'Explains why, over several lines.',
      '# not a comment once it is in the message',
      '',
      'Co-authored-by: Someone <someone@example.com>',
    ].join('\n');
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: `aaa1111\x1faaa1111\x1fAdd the widget\x1f${fullMessage}\n\0`,
        stderr: '',
      },
    });

    const result = await service.getRebaseCommits('abc1234');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].subject).toBe('Add the widget');
      // The whole thing — not truncated at the first newline, and the blank
      // lines that separate body from trailers are kept.
      expect(result.value[0].message).toBe(fullMessage);
    }
  });

  it('trims only trailing newlines from the message', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: 'aaa1111\x1faaa1111\x1fsubject\x1fsubject\n\nbody\n\n\n\0', stderr: '' },
    });

    const result = await service.getRebaseCommits('abc1234');
    if (result.success) expect(result.value[0].message).toBe('subject\n\nbody');
  });

  it('requests a NUL-delimited %B log', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.getRebaseCommits('abc1234');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['log', '--reverse', '--ancestry-path', '-z', '--format=%H\x1f%h\x1f%s\x1f%B', 'abc1234..HEAD', '--'],
    }));
  });

  it('returns empty array when no commits between base and HEAD', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.getRebaseCommits('abc1234');
    if (result.success) expect(result.value).toEqual([]);
  });
});

describe('GitRebaseService.rebase', () => {
  it('rejects invalid target ref', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const result = await service.rebase('-x');
    expect(result.success).toBe(false);
  });

  it('runs git rebase <ref> on success', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.rebase('main');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: ['rebase', 'main'] }));
  });

  it('adds --ignore-date before the ref when ignoreDate=true', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.rebase('main', { ignoreDate: true });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['rebase', '--ignore-date', 'main'],
    }));
    expect(spy.mock.calls[0][0].env).toBeUndefined();
  });

  it('autosquashes without -i on git 2.44+', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.rebase('main', { autosquash: true, gitVersion: [2, 44, 0] });
    expect(spy.mock.calls[0][0].args).toEqual(['rebase', '--autosquash', 'main']);
    expect(spy.mock.calls[0][0].env).toBeUndefined();
  });

  it('autosquashes through -i with a no-op sequence editor on older or unknown git', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.rebase('main', { autosquash: true, ignoreDate: true, gitVersion: null });
    expect(spy.mock.calls[0][0].args).toEqual(['rebase', '-i', '--autosquash', '--empty=drop', '--ignore-date', 'main']);
    expect(spy.mock.calls[0][0].env).toEqual({ GIT_SEQUENCE_EDITOR: 'true' });
  });

  it('returns REBASE_CONFLICT error when stderr signals a conflict', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true); // simulate rebase-merge dir exists
    const service = new GitRebaseService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('boom', 'COMMAND_FAILED', 'git rebase main', 'CONFLICT (content)'),
    });

    const result = await service.rebase('main');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('REBASE_CONFLICT');
  });
});

describe('GitRebaseService.getRebaseRangeCommits', () => {
  it('rejects an invalid upstream', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const result = await service.getRebaseRangeCommits('-x');
    expect(result.success).toBe(false);
  });

  it('reads the commits git would replay, in its todo order', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: 'a'.repeat(40) + '\x1ffixup! X\0', stderr: '' },
    });

    const result = await service.getRebaseRangeCommits('origin/main');
    expect(spy.mock.calls[0][0].args).toEqual([
      'log', '--reverse', '--topo-order', '--no-merges', '--right-only', '--cherry-pick', '-z',
      '--format=%H\x1f%s', 'origin/main...HEAD', '--',
    ]);
    expect(result.success && result.value).toEqual([{ hash: 'a'.repeat(40), subject: 'fixup! X' }]);
  });
});

describe('GitRebaseService.getConflictInfo', () => {
  /** `hasAmendFile`: git left `rebase-merge/amend`, as it does at an `edit` stop or a rejected reword. */
  function stubStatus(service: GitRebaseService, status: string, hasAmendFile = false) {
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    vi.mocked(fs.existsSync).mockImplementation((p) => (String(p).endsWith('amend') ? hasAmendFile : true));
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({ success: true, value: { stdout: status, stderr: '' } });
  }

  it('flags a pause with a clean tree as stopped on an empty commit', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    stubStatus(service, '?? untracked.txt\n');
    const result = await service.getConflictInfo();
    expect(result.success && result.value.stoppedOnEmptyCommit).toBe(true);
  });

  it('does not flag a clean pause at an edit stop or a rejected reword', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    stubStatus(service, '', true);
    const result = await service.getConflictInfo();
    expect(result.success && result.value.stoppedOnEmptyCommit).toBe(false);
  });

  it('does not flag a pause with conflicted files', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    stubStatus(service, 'UU a.txt\n');
    const result = await service.getConflictInfo();
    expect(result.success && result.value).toMatchObject({ conflictedFiles: ['a.txt'], stoppedOnEmptyCommit: false });
  });

  it('does not flag a pause with staged changes left over', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    stubStatus(service, 'M  a.txt\n');
    const result = await service.getConflictInfo();
    expect(result.success && result.value.stoppedOnEmptyCommit).toBe(false);
  });
});

describe('GitRebaseService.interactiveRebase temp scripts', () => {
  it('numbers editor messages in the order git asks for them', async () => {
    vi.mocked(fs.writeFileSync).mockReset();
    const service = new GitRebaseService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });
    const entry = (hash: string, action: 'pick' | 'squash' | 'reword' | 'fixup', rewordMessage?: string) =>
      ({ hash: hash.repeat(40), abbreviatedHash: hash.repeat(7), subject: hash, message: hash, action, rewordMessage });

    await service.interactiveRebase({
      baseHash: 'f'.repeat(40),
      entries: [entry('a', 'pick'), entry('b', 'squash'), entry('c', 'reword', 'C new'), entry('d', 'fixup')],
      squashMessages: [{ groupLeadHash: 'a'.repeat(40), combinedMessage: 'A+B' }],
    });

    const written = new Map(
      vi.mocked(fs.writeFileSync).mock.calls.map(([file, content]) => [String(file).split(/[\\/]/).pop(), content]),
    );
    expect(written.get('message-0.txt')).toBe('A+B');
    expect(written.get('message-1.txt')).toBe('C new');
    expect(written.get('todo.txt')).toBe(
      `pick ${'a'.repeat(40)} a\nsquash ${'b'.repeat(40)} b\nreword ${'c'.repeat(40)} c\nfixup ${'d'.repeat(40)} d\n`,
    );
  });
});

describe('GitRebaseService.abortRebase / continueRebase', () => {
  it('abortRebase runs git rebase --abort', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.abortRebase();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: ['rebase', '--abort'] }));
  });

  it('continueRebase leaves the editor to GitExecutor when there is no active tmpDir', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.continueRebase();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: ['rebase', '--continue'] }));
    // No override: the executor's default no-op editor accepts each prepared message.
    expect(spy.mock.calls[0][0].env).toBeUndefined();
  });
});
