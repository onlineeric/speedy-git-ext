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

  it('parses log output into RebaseEntry[] with default action="pick"', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [
          'aaa1111\x1faaa1111\x1ffirst',
          'bbb2222\x1fbbb2222\x1fsecond',
        ].join('\n'),
        stderr: '',
      },
    });

    const result = await service.getRebaseCommits('abc1234');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual([
        { hash: 'aaa1111', abbreviatedHash: 'aaa1111', subject: 'first', action: 'pick' },
        { hash: 'bbb2222', abbreviatedHash: 'bbb2222', subject: 'second', action: 'pick' },
      ]);
    }
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

  it('appends --ignore-date when ignoreDate=true', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.rebase('main', true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['rebase', 'main', '--ignore-date'],
    }));
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

  it('continueRebase passes GIT_EDITOR=true when no active tmpDir', async () => {
    const service = new GitRebaseService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.continueRebase();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['rebase', '--continue'],
      env: { GIT_EDITOR: 'true' },
    }));
  });
});
