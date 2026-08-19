import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitDiffService } from '../services/GitDiffService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

const NUL = '\x00';

describe('GitDiffService.getCommitDetails', () => {
  it('rejects invalid hashes', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const result = await service.getCommitDetails('not-a-hash!');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns PARSE_ERROR when metadata stdout has too few fields', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValueOnce({
      success: true,
      value: { stdout: 'just\x00three\x00fields', stderr: '' },
    });

    const result = await service.getCommitDetails('abc1234');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PARSE_ERROR');
  });

  it('parses commit metadata into CommitDetails on success', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const meta = [
      '1234567890abcdef1234567890abcdef12345678',
      'aaaaaaa',
      'parent1',
      'Eric',
      'eric@x',
      '1700000000',
      'Eric',
      'eric@x',
      '1700000010',
      'fix: bug',
      'body line 1',
    ].join(NUL);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: meta, stderr: '' } }) // show meta
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })   // diff name-status
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });  // numstat

    const result = await service.getCommitDetails('1234567890abcdef1234567890abcdef12345678');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.hash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(result.value.subject).toBe('fix: bug');
      expect(result.value.body).toBe('body line 1');
      expect(result.value.parents).toEqual(['parent1']);
      expect(result.value.authorDate).toBe(1700000000 * 1000);
      expect(result.value.committerDate).toBe(1700000010 * 1000);
      expect(result.value.files).toEqual([]);
    }
  });
});

describe('GitDiffService.getDiffFileChanges', () => {
  it('parses simple modified/added/deleted entries', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [
          ':100644 100644 aaaaaaa bbbbbbb M', 'src/a.ts',
          ':000000 100644 0000000 ccccccc A', 'src/new.ts',
          ':100644 000000 ddddddd 0000000 D', 'old.ts',
        ].join(NUL) + NUL,
        stderr: '',
      },
    });

    const result = await service.getDiffFileChanges('abc1234');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual([
        { path: 'src/a.ts', status: 'modified' },
        { path: 'src/new.ts', status: 'added' },
        { path: 'old.ts', status: 'deleted' },
      ]);
    }
  });

  it('parses rename entry as { path: newPath, oldPath, status: renamed }', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [':100644 100644 aaaaaaa bbbbbbb R100', 'old/path.ts', 'new/path.ts'].join(NUL) + NUL,
        stderr: '',
      },
    });

    const result = await service.getDiffFileChanges('abc1234');
    if (result.success) {
      expect(result.value).toEqual([
        { path: 'new/path.ts', oldPath: 'old/path.ts', status: 'renamed' },
      ]);
    }
  });

  it('parses copy entry as status=copied', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [':100644 100644 aaaaaaa bbbbbbb C75', 'src/a.ts', 'src/b.ts'].join(NUL) + NUL,
        stderr: '',
      },
    });

    const result = await service.getDiffFileChanges('abc1234');
    if (result.success) {
      expect(result.value[0].status).toBe('copied');
      expect(result.value[0].oldPath).toBe('src/a.ts');
    }
  });

  it('uses --root for non-merge commits and ^1..hash for merge commits', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.getDiffFileChanges('abc1234', false);
    expect(spy.mock.calls[0][0].args).toContain('--root');

    spy.mockClear();
    await service.getDiffFileChanges('abc1234', true);
    expect(spy.mock.calls[0][0].args).toContain('abc1234^1');
    expect(spy.mock.calls[0][0].args).not.toContain('--root');
  });

  it('returns empty array for empty output', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.getDiffFileChanges('abc1234');
    if (result.success) expect(result.value).toEqual([]);
  });
});

describe('GitDiffService.getCommitFile', () => {
  it('rejects invalid hashes and paths', async () => {
    const service = new GitDiffService('/repo', mockLog);
    expect((await service.getCommitFile('bad!', 'a.ts')).success).toBe(false);
    expect((await service.getCommitFile('abc1234', '')).success).toBe(false);
    expect((await service.getCommitFile('abc1234', '--evil')).success).toBe(false);
  });

  it('builds git show <hash>:<path>', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: 'file content', stderr: '' },
    });

    const result = await service.getCommitFile('abc1234', 'src/foo.ts');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe('file content');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['show', 'abc1234:src/foo.ts'],
    }));
  });
});

describe('GitDiffService submodule (gitlink) handling', () => {
  const GITLINK_SHA = 'ec5f862988547fabd5c10efa49c288469314e41a';
  const PARENT_SHA = 'f4b7306bdab79fb7fc3fad64c2cf98667147d892';

  /** What `git show <rev>:<gitlink>` really does — the path resolves, the object does not exist here. */
  const badObject = () => ({
    success: false as const,
    error: new GitError('fatal: bad object abc1234:sub', 'COMMAND_FAILED'),
  });

  it('flags a changed submodule via the 160000 mode in --raw output', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [
          `:160000 160000 ${PARENT_SHA} ${GITLINK_SHA} M`, 'submodules/repo-a',
          ':100644 100644 aaaaaaa bbbbbbb M', 'src/a.ts',
        ].join(NUL) + NUL,
        stderr: '',
      },
    });

    const result = await service.getDiffFileChanges('abc1234');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual([
        { path: 'submodules/repo-a', status: 'modified', isSubmodule: true },
        { path: 'src/a.ts', status: 'modified' },
      ]);
    }
  });

  it('flags an added submodule, whose src mode is 000000', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [`:000000 160000 0000000 ${GITLINK_SHA} A`, 'sub'].join(NUL) + NUL,
        stderr: '',
      },
    });

    const result = await service.getDiffFileChanges('abc1234');
    if (result.success) expect(result.value[0]).toEqual({ path: 'sub', status: 'added', isSubmodule: true });
  });

  it('flags a removed submodule, whose dst mode is 000000', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [`:160000 000000 ${GITLINK_SHA} 0000000 D`, 'sub'].join(NUL) + NUL,
        stderr: '',
      },
    });

    const result = await service.getDiffFileChanges('abc1234');
    if (result.success) expect(result.value[0]).toEqual({ path: 'sub', status: 'deleted', isSubmodule: true });
  });

  it('renders the pointer line when git show fails on a gitlink (issue #184)', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce(badObject())
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: `160000 commit ${GITLINK_SHA}\tsubmodules/repo-a\n`, stderr: '' },
      });

    const result = await service.getCommitFile('abc1234', 'submodules/repo-a');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe(`Subproject commit ${GITLINK_SHA}\n`);
    expect(spy.mock.calls[1][0].args).toEqual(['ls-tree', '--end-of-options', 'abc1234', '--', 'submodules/repo-a']);
  });

  it('renders the pointer for the parent side too, so neither side of the diff is blank', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce(badObject())
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: `160000 commit ${PARENT_SHA}\tsubmodules/repo-a\n`, stderr: '' },
      });

    const result = await service.getCommitFile('abc1234~1', 'submodules/repo-a');
    if (result.success) expect(result.value).toBe(`Subproject commit ${PARENT_SHA}\n`);
  });

  it('keeps the original error for a path that is genuinely absent, not a gitlink', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce(badObject())
      // `git ls-tree` prints nothing for a path that is not in that tree.
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getCommitFile('abc1234', 'deleted.ts');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('COMMAND_FAILED');
  });

  it('does not mistake an ordinary blob for a gitlink', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce(badObject())
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: '100644 blob b962408116cab8dd7132dc0d9ceae1a0f9ac8db8\treadme.md\n', stderr: '' },
      });

    const result = await service.getCommitFile('abc1234', 'readme.md');
    expect(result.success).toBe(false);
  });

  it('renders the staged pointer from ls-files when git show :<path> fails', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce(badObject())
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: `160000 ${GITLINK_SHA} 0\tsub\n`, stderr: '' },
      });

    const result = await service.getStagedFileContent('sub');
    if (result.success) expect(result.value).toBe(`Subproject commit ${GITLINK_SHA}\n`);
    expect(spy.mock.calls[1][0].args).toEqual(['ls-files', '-s', '--', 'sub']);
  });

  it('reads the working-tree pointer from submodule status', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: ` ${GITLINK_SHA} sub (heads/main)\n`, stderr: '' },
    });

    const result = await service.getWorkingTreeSubmoduleContent('sub');
    if (result.success) expect(result.value).toBe(`Subproject commit ${GITLINK_SHA}\n`);
  });

  it("strips submodule status's '+' flag for a checkout that differs from the index", async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: `+${GITLINK_SHA} sub (heads/main)\n`, stderr: '' },
    });

    const result = await service.getWorkingTreeSubmoduleContent('sub');
    if (result.success) expect(result.value).toBe(`Subproject commit ${GITLINK_SHA}\n`);
  });

  it("returns nothing for an uninitialized submodule ('-'), never the parent's HEAD", async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: `-${GITLINK_SHA} sub\n`, stderr: '' },
    });

    const result = await service.getWorkingTreeSubmoduleContent('sub');
    if (result.success) expect(result.value).toBe('');
  });
});

describe('GitDiffService.getStagedFileContent', () => {
  it('builds git show :<path>', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: 'staged content', stderr: '' },
    });

    await service.getStagedFileContent('src/foo.ts');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['show', ':src/foo.ts'],
    }));
  });

  it('rejects flag-injected paths', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const result = await service.getStagedFileContent('--evil');
    expect(result.success).toBe(false);
  });
});

describe('GitDiffService.openExternalDirDiff', () => {
  it('defaults parent to <hash>~1 when not provided', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.openExternalDirDiff('abc1234');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['difftool', '--dir-diff', '--no-prompt', 'abc1234~1', 'abc1234'],
      timeout: 60000,
    }));
  });

  it('uses provided parent when set', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.openExternalDirDiff('abc1234', 'def5678');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['difftool', '--dir-diff', '--no-prompt', 'def5678', 'abc1234'],
    }));
  });

  it('rejects invalid parent hashes', async () => {
    const service = new GitDiffService('/repo', mockLog);
    const result = await service.openExternalDirDiff('abc1234', 'not-a-hash!');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GitDiffService.getUncommittedSummary', () => {
  it('parses staged/unstaged/untracked from porcelain v2 output', async () => {
    const service = new GitDiffService('/repo', mockLog);
    // Build a NUL-separated porcelain v2 output:
    // "1 M. ... src/foo.ts" (staged modify), "1 .M ... src/bar.ts" (unstaged modify), "? newfile.txt"
    const tokens = [
      '1 M. N... 100644 100644 100644 0000 0000 src/foo.ts',
      '1 .M N... 100644 100644 100644 0000 0000 src/bar.ts',
      '? newfile.txt',
    ];
    const statusOutput = tokens.join(NUL) + NUL;

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: statusOutput, stderr: '' } }) // status
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // staged numstat
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // unstaged numstat
      .mockResolvedValueOnce({ success: false, error: new GitError('no merge', 'COMMAND_FAILED') }) // MERGE_HEAD
      .mockResolvedValueOnce({ success: false, error: new GitError('no rebase', 'COMMAND_FAILED') }) // REBASE_HEAD
      .mockResolvedValueOnce({ success: false, error: new GitError('no cp', 'COMMAND_FAILED') }); // CHERRY_PICK_HEAD

    const result = await service.getUncommittedSummary();
    expect(result.success).toBe(true);
    expect(service['executor'].execute).toHaveBeenCalledWith(expect.objectContaining({
      args: ['status', '--porcelain=v2', '-z', '--ignore-submodules=dirty'],
    }));
    if (result.success) {
      expect(result.value.stagedFiles).toHaveLength(1);
      expect(result.value.stagedFiles[0]).toMatchObject({
        path: 'src/foo.ts',
        status: 'modified',
        stageState: 'staged',
      });
      expect(result.value.unstagedFiles).toHaveLength(2); // bar.ts + untracked newfile
      expect(result.value.untrackedCount).toBe(1);
      expect(result.value.conflictType).toBeUndefined();
    }
  });

  it("flags a submodule row from porcelain v2's 'S' field, leaving files as 'N'", async () => {
    const service = new GitDiffService('/repo', mockLog);
    const tokens = [
      '1 M. SC.. 160000 160000 160000 0000 0000 submodules/repo-a',
      '1 .M N... 100644 100644 100644 0000 0000 src/bar.ts',
    ];

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: tokens.join(NUL) + NUL, stderr: '' } })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
      .mockResolvedValueOnce({ success: false, error: new GitError('no merge', 'COMMAND_FAILED') })
      .mockResolvedValueOnce({ success: false, error: new GitError('no rebase', 'COMMAND_FAILED') })
      .mockResolvedValueOnce({ success: false, error: new GitError('no cp', 'COMMAND_FAILED') });

    const result = await service.getUncommittedSummary();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.stagedFiles[0]).toMatchObject({ path: 'submodules/repo-a', isSubmodule: true });
      expect(result.value.unstagedFiles[0].isSubmodule).toBeUndefined();
    }
  });

  it('detects merge conflict when MERGE_HEAD exists', async () => {
    const service = new GitDiffService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // status
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // staged numstat
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // unstaged numstat
      .mockResolvedValueOnce({ success: true, value: { stdout: 'aaa', stderr: '' } }) // MERGE_HEAD exists
      .mockResolvedValueOnce({ success: false, error: new GitError('no rebase', 'COMMAND_FAILED') })
      .mockResolvedValueOnce({ success: false, error: new GitError('no cp', 'COMMAND_FAILED') })
      .mockResolvedValueOnce({ success: true, value: { stdout: 'src/conflict.ts\n', stderr: '' } }); // diff --diff-filter=U

    const result = await service.getUncommittedSummary();
    if (result.success) {
      expect(result.value.conflictType).toBe('merge');
      expect(result.value.conflictFiles).toHaveLength(1);
      expect(result.value.conflictFiles[0].path).toBe('src/conflict.ts');
    }
  });
});
