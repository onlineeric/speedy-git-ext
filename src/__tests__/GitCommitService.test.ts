import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitCommitService } from '../services/GitCommitService.js';
import { GitError, ok, err, type Result } from '../../shared/errors.js';
import type { GitExecResult } from '../services/GitExecutor.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdtempSync: vi.fn(() => '/tmp/speedy-git-amend-test'),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import * as fs from 'fs';

const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MOVED_HEAD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function stdout(text: string): Result<GitExecResult> {
  return ok({ stdout: text, stderr: '' });
}

/** Answers `rev-parse HEAD` from a queue; everything else from `onCommit`. */
function stubExecutor(
  service: GitCommitService,
  heads: string[],
  onCommit: () => Result<GitExecResult> = () => stdout(''),
) {
  const queue = [...heads];
  return vi.spyOn(service['executor'], 'execute').mockImplementation(async (options) => {
    if (options.args[0] === 'rev-parse') return stdout(`${queue.shift() ?? HEAD}\n`);
    return onCommit();
  });
}

function argsOfCommit(spy: ReturnType<typeof stubExecutor>): string[] | undefined {
  return spy.mock.calls.map(([options]) => options.args).find((args) => args[0] === 'commit');
}

beforeEach(() => {
  vi.mocked(fs.mkdtempSync).mockClear();
  vi.mocked(fs.writeFileSync).mockClear();
  vi.mocked(fs.rmSync).mockClear();
});

describe('GitCommitService.getCommitMessage', () => {
  it('rejects an invalid hash before running anything', async () => {
    const service = new GitCommitService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute');
    const result = await service.getCommitMessage('not-a-hash');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });

  it('reads %B and trims only trailing newlines', async () => {
    const service = new GitCommitService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue(stdout('Subject\n\nBody line\n\nTrailer: x\n\n'));

    const result = await service.getCommitMessage('abc1234');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe('Subject\n\nBody line\n\nTrailer: x');
  });
});

describe('GitCommitService.amendCommit', () => {
  it('refuses without committing when HEAD has moved since the dialog opened', async () => {
    const service = new GitCommitService('/repo', mockLog);
    const spy = stubExecutor(service, [MOVED_HEAD]);

    const result = await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('HEAD_MOVED');
    expect(argsOfCommit(spy)).toBeUndefined();
  });

  it('passes --only and -F when amending the message alone', async () => {
    const service = new GitCommitService('/repo', mockLog);
    const spy = stubExecutor(service, [HEAD]);

    await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });

    expect(argsOfCommit(spy)).toEqual([
      'commit', '--amend', '--only', '-F', expect.stringContaining('COMMIT_EDITMSG'),
    ]);
  });

  it('omits --only when the staged changes are being folded in', async () => {
    const service = new GitCommitService('/repo', mockLog);
    const spy = stubExecutor(service, [HEAD]);

    await service.amendCommit({ message: 'new', includeStaged: true, expectedHead: HEAD });

    const args = argsOfCommit(spy);
    expect(args).not.toContain('--only');
    expect(args).toContain('-F');
  });

  it('writes the message to a file rather than passing it as an argument', async () => {
    const service = new GitCommitService('/repo', mockLog);
    const spy = stubExecutor(service, [HEAD]);

    await service.amendCommit({ message: 'Subject\n\n# body line', includeStaged: false, expectedHead: HEAD });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('COMMIT_EDITMSG'),
      'Subject\n\n# body line',
      'utf-8',
    );
    expect(argsOfCommit(spy)).not.toContain('-m');
  });

  it('gives the amend a 60s ceiling instead of the executor default', async () => {
    const service = new GitCommitService('/repo', mockLog);
    const spy = stubExecutor(service, [HEAD]);

    await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });

    const commitCall = spy.mock.calls.map(([options]) => options).find((options) => options.args[0] === 'commit');
    expect(commitCall?.timeout).toBe(60_000);
  });

  it('removes the temp directory on success and on failure', async () => {
    const service = new GitCommitService('/repo', mockLog);
    stubExecutor(service, [HEAD]);
    await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/speedy-git-amend-test', { recursive: true, force: true });

    vi.mocked(fs.rmSync).mockClear();
    const failing = new GitCommitService('/repo', mockLog);
    stubExecutor(failing, [HEAD], () => err(new GitError('hook rejected', 'COMMAND_FAILED')));
    await failing.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/speedy-git-amend-test', { recursive: true, force: true });
  });

  it('surfaces an ordinary git failure unchanged', async () => {
    const service = new GitCommitService('/repo', mockLog);
    stubExecutor(service, [HEAD], () => err(new GitError('commit-msg hook failed', 'COMMAND_FAILED')));

    const result = await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('COMMAND_FAILED');
      expect(result.error.message).toBe('commit-msg hook failed');
    }
  });

  describe('after the wait is cut short', () => {
    it('reports the amend as not done when HEAD is observed unchanged', async () => {
      const service = new GitCommitService('/repo', mockLog);
      // Both the pre-flight check and the post-cancel observation see the same HEAD.
      stubExecutor(service, [HEAD, HEAD], () => err(new GitError('Cancelled', 'CANCELLED')));

      const result = await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CANCELLED');
        expect(result.error.message).toContain('was not amended');
        expect(result.error.message).toContain('may still be running');
      }
    });

    it('reports success when HEAD is observed to have moved — the amend landed anyway', async () => {
      const service = new GitCommitService('/repo', mockLog);
      stubExecutor(service, [HEAD, MOVED_HEAD], () => err(new GitError('Cancelled', 'CANCELLED')));

      const result = await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('Commit amended');
        expect(result.value).toContain('may still be running');
      }
    });

    it('names the uncertainty rather than guessing when HEAD cannot be re-read', async () => {
      const service = new GitCommitService('/repo', mockLog);
      let revParseCalls = 0;
      vi.spyOn(service['executor'], 'execute').mockImplementation(async (options) => {
        if (options.args[0] === 'rev-parse') {
          revParseCalls += 1;
          return revParseCalls === 1 ? stdout(`${HEAD}\n`) : err(new GitError('boom', 'COMMAND_FAILED'));
        }
        return err(new GitError('timed out', 'TIMEOUT'));
      });

      const result = await service.amendCommit({ message: 'new', includeStaged: false, expectedHead: HEAD });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('TIMEOUT');
        expect(result.error.message).toContain('could not be determined');
      }
    });
  });
});
