import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lstat, readdir, rmdir } from 'node:fs/promises';
import { pruneEmptyParents, sweepEmptyDirs } from '../utils/emptyDirCleanup.js';

vi.mock('node:fs/promises', () => ({
  lstat: vi.fn(),
  readdir: vi.fn(),
  rmdir: vi.fn(),
}));

const lstatMock = vi.mocked(lstat);
const readdirMock = vi.mocked(readdir);
const rmdirMock = vi.mocked(rmdir);

const log = { warn: vi.fn() };

/** An `lstat` answering "real directory" for every path. */
function everythingIsADirectory() {
  lstatMock.mockResolvedValue({ isDirectory: () => true } as never);
}

/** A Dirent stub for `readdir(..., { withFileTypes: true })`. */
function dirent(name: string, isDirectory = true) {
  return { name, isDirectory: () => isDirectory };
}

/** An error carrying an errno code, as fs rejections do. */
function fsError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  rmdirMock.mockResolvedValue(undefined as never);
  readdirMock.mockResolvedValue([] as never);
  everythingIsADirectory();
});

describe('pruneEmptyParents', () => {
  it('walks up deleting empty parents and stops before the base dir', async () => {
    await pruneEmptyParents('/base/a/b/leaf', '/base', log);

    expect(rmdirMock.mock.calls.map((call) => call[0])).toEqual(['/base/a/b', '/base/a']);
  });

  it('never removes the base dir itself', async () => {
    await pruneEmptyParents('/base/leaf', '/base', log);

    expect(rmdirMock).not.toHaveBeenCalled();
  });

  it('stops as soon as a parent is not empty', async () => {
    rmdirMock.mockRejectedValueOnce(fsError('ENOTEMPTY'));

    await pruneEmptyParents('/base/a/b/leaf', '/base', log);

    expect(rmdirMock).toHaveBeenCalledTimes(1);
    expect(rmdirMock).toHaveBeenCalledWith('/base/a/b');
    // A non-empty parent is the expected stopping condition, not a problem worth logging.
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('stops and logs once when a parent cannot be removed', async () => {
    rmdirMock.mockRejectedValueOnce(fsError('EPERM'));

    await pruneEmptyParents('/base/a/b/leaf', '/base', log);

    expect(rmdirMock).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the removed worktree is outside the base dir', async () => {
    await pruneEmptyParents('/elsewhere/a/leaf', '/base', log);

    expect(rmdirMock).not.toHaveBeenCalled();
  });

  it('does not follow a symlinked parent', async () => {
    // `rmdir` never follows a symlink — it answers ENOTDIR — so the walk stops there
    // with nothing deleted and nothing logged.
    rmdirMock.mockRejectedValueOnce(fsError('ENOTDIR'));

    await pruneEmptyParents('/base/a/b/leaf', '/base', log);

    expect(rmdirMock).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('sweepEmptyDirs', () => {
  it('deletes a two-level empty chain bottom-up', async () => {
    readdirMock.mockImplementation((async (dir: string) => {
      if (dir === '/base') return [dirent('a')];
      if (dir === '/base/a') return [dirent('b')];
      return [];
    }) as never);

    await sweepEmptyDirs('/base', log);

    expect(rmdirMock.mock.calls.map((call) => call[0])).toEqual(['/base/a/b', '/base/a']);
  });

  it('never removes the base dir itself', async () => {
    readdirMock.mockResolvedValue([] as never);

    await sweepEmptyDirs('/base', log);

    expect(rmdirMock).not.toHaveBeenCalled();
  });

  it('leaves a directory that still holds a worktree alone', async () => {
    readdirMock.mockImplementation((async (dir: string) => (dir === '/base' ? [dirent('live')] : [])) as never);
    rmdirMock.mockRejectedValue(fsError('ENOTEMPTY'));

    await sweepEmptyDirs('/base', log);

    expect(rmdirMock).toHaveBeenCalledWith('/base/live');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('never descends into a worktree checkout, so its own empty folders survive', async () => {
    // `<base>/feat/branch1` is a live worktree: it carries a `.git` file and an
    // untracked empty `logs/` folder git could never restore.
    readdirMock.mockImplementation((async (dir: string) => {
      if (dir === '/base') return [dirent('feat')];
      if (dir === '/base/feat') return [dirent('branch1')];
      if (dir === '/base/feat/branch1') return [dirent('.git', false), dirent('logs')];
      return [];
    }) as never);
    rmdirMock.mockRejectedValue(fsError('ENOTEMPTY'));

    await sweepEmptyDirs('/base', log);

    expect(readdirMock.mock.calls.map((call) => call[0])).not.toContain('/base/feat/branch1/logs');
    expect(rmdirMock).not.toHaveBeenCalledWith('/base/feat/branch1/logs');
  });

  it('skips symlinks and files, descending only into real directories', async () => {
    readdirMock.mockImplementation((async (dir: string) =>
      dir === '/base' ? [dirent('link', false), dirent('real')] : []) as never);

    await sweepEmptyDirs('/base', log);

    expect(rmdirMock.mock.calls.map((call) => call[0])).toEqual(['/base/real']);
  });

  it('is a no-op when the base dir does not exist', async () => {
    lstatMock.mockRejectedValue(fsError('ENOENT'));

    await sweepEmptyDirs('/base', log);

    expect(readdirMock).not.toHaveBeenCalled();
    expect(rmdirMock).not.toHaveBeenCalled();
  });
});
