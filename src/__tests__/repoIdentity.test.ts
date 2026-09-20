import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isPathInside,
  isSameWorkingTree,
  isSubmoduleOf,
  normalizeRepoPath,
  pathsEqual,
  sharesObjectStore,
  type RepoIdentity,
} from '../utils/repoIdentity.js';

function identity(overrides: Partial<RepoIdentity>): RepoIdentity {
  return {
    repoPath: '/repos/a',
    gitDir: '/repos/a/.git',
    commonGitDir: '/repos/a/.git',
    topLevel: '/repos/a',
    ...overrides,
  };
}

/** `process.platform` is read at call time by every predicate, so it is mockable. */
function withPlatform(platform: NodeJS.Platform, run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(process, 'platform', original);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('normalizeRepoPath', () => {
  it('strips a trailing separator', () => {
    expect(normalizeRepoPath('/repos/a/')).toBe('/repos/a');
  });

  it('resolves .. segments', () => {
    expect(normalizeRepoPath('/repos/a/sub/..')).toBe('/repos/a');
  });

  it('answers empty for an empty path', () => {
    expect(normalizeRepoPath('')).toBe('');
  });

  it('lowercases only the drive letter on win32', () => {
    withPlatform('win32', () => {
      expect(normalizeRepoPath('C:\\Repos\\MyRepo')).toBe('c:\\Repos\\MyRepo');
      expect(normalizeRepoPath('C:\\Repos\\MyRepo\\')).toBe('c:\\Repos\\MyRepo');
    });
  });
});

describe('pathsEqual', () => {
  it('is case-sensitive on posix', () => {
    withPlatform('linux', () => {
      expect(pathsEqual('/repos/A', '/repos/a')).toBe(false);
      expect(pathsEqual('/repos/a', '/repos/a')).toBe(true);
    });
  });

  it('is case-insensitive on win32', () => {
    withPlatform('win32', () => {
      expect(pathsEqual('c:/Repos/A', 'C:/repos/a')).toBe(true);
    });
  });

  it('answers false when either side is empty', () => {
    expect(pathsEqual('', '/repos/a')).toBe(false);
    expect(pathsEqual('/repos/a', '')).toBe(false);
  });
});

describe('isPathInside', () => {
  it('is true for a nested path', () => {
    expect(isPathInside('/repos/a', '/repos/a/sub')).toBe(true);
  });

  it('is false when the two are equal', () => {
    expect(isPathInside('/repos/a', '/repos/a')).toBe(false);
  });

  it('is false for a sibling whose name starts with the parent name', () => {
    expect(isPathInside('/repos/repo', '/repos/repo2')).toBe(false);
  });

  it('ignores trailing separators', () => {
    expect(isPathInside('/repos/a/', '/repos/a/sub/')).toBe(true);
  });

  it('resolves .. segments before deciding', () => {
    expect(isPathInside('/repos/a', '/repos/a/sub/../..')).toBe(false);
  });

  it('is false for an empty parent (the bare-repo guard)', () => {
    expect(isPathInside('', '/repos/a')).toBe(false);
  });
});

describe('isSameWorkingTree', () => {
  it('matches on gitDir, not on repoPath', () => {
    const a = identity({ repoPath: '/repos/a' });
    const b = identity({ repoPath: '/elsewhere/a' });
    expect(isSameWorkingTree(a, b)).toBe(true);
  });

  it('is false for a linked worktree of the same repo', () => {
    const main = identity({});
    const linked = identity({
      repoPath: '/repos/a.worktrees/feat',
      gitDir: '/repos/a/.git/worktrees/feat',
      topLevel: '/repos/a.worktrees/feat',
    });
    expect(isSameWorkingTree(main, linked)).toBe(false);
  });
});

describe('sharesObjectStore', () => {
  it('is true for a repo and its linked worktree', () => {
    const main = identity({});
    const linked = identity({
      repoPath: '/repos/a.worktrees/feat',
      gitDir: '/repos/a/.git/worktrees/feat',
      topLevel: '/repos/a.worktrees/feat',
    });
    expect(sharesObjectStore(main, linked)).toBe(true);
  });

  it('is false for a submodule, whose object store is separate', () => {
    const parent = identity({});
    const submodule = identity({
      repoPath: '/repos/a/sub',
      gitDir: '/repos/a/.git/modules/sub',
      commonGitDir: '/repos/a/.git/modules/sub',
      topLevel: '/repos/a/sub',
    });
    expect(sharesObjectStore(parent, submodule)).toBe(false);
  });
});

describe('isSubmoduleOf', () => {
  it('is true for a submodule of the parent', () => {
    const parent = identity({});
    const submodule = identity({
      repoPath: '/repos/a/sub',
      gitDir: '/repos/a/.git/modules/sub',
      commonGitDir: '/repos/a/.git/modules/sub',
      topLevel: '/repos/a/sub',
    });
    expect(isSubmoduleOf(parent, submodule)).toBe(true);
    expect(isSubmoduleOf(submodule, parent)).toBe(false);
  });

  it('is true for a submodule checked out inside a linked worktree', () => {
    const worktree = identity({
      repoPath: '/repos/a.worktrees/feat',
      gitDir: '/repos/a/.git/worktrees/feat',
      topLevel: '/repos/a.worktrees/feat',
    });
    const submodule = identity({
      repoPath: '/repos/a.worktrees/feat/sub',
      gitDir: '/repos/a/.git/worktrees/feat/modules/sub',
      commonGitDir: '/repos/a/.git/modules/sub',
      topLevel: '/repos/a.worktrees/feat/sub',
    });
    expect(isSubmoduleOf(worktree, submodule)).toBe(true);
  });

  it('is false when the parent is bare (empty topLevel)', () => {
    const bare = identity({ topLevel: '' });
    const other = identity({ repoPath: '/repos/a/sub', topLevel: '/repos/a/sub' });
    expect(isSubmoduleOf(bare, other)).toBe(false);
  });
});
