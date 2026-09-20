import { describe, it, expect } from 'vitest';
import {
  panelTitleFor,
  pickRepoTarget,
  pickReturnTarget,
  tabsAffectedByChange,
  tabsOnWorkingTree,
  tabsOrphanedByRepoRemoval,
  type TabSnapshot,
} from '../utils/graphTabRouting.js';
import type { RepoIdentity } from '../utils/repoIdentity.js';

const repoA: RepoIdentity = {
  repoPath: '/repos/a',
  gitDir: '/repos/a/.git',
  commonGitDir: '/repos/a/.git',
  topLevel: '/repos/a',
};

/** A linked worktree of repo A: its own checkout, A's object store. */
const worktreeA: RepoIdentity = {
  repoPath: '/repos/a.worktrees/feat',
  gitDir: '/repos/a/.git/worktrees/feat',
  commonGitDir: '/repos/a/.git',
  topLevel: '/repos/a.worktrees/feat',
};

/** A submodule of repo A: inside A's tree, separate object store. */
const submoduleA: RepoIdentity = {
  repoPath: '/repos/a/sub',
  gitDir: '/repos/a/.git/modules/sub',
  commonGitDir: '/repos/a/.git/modules/sub',
  topLevel: '/repos/a/sub',
};

const repoB: RepoIdentity = {
  repoPath: '/repos/b',
  gitDir: '/repos/b/.git',
  commonGitDir: '/repos/b/.git',
  topLevel: '/repos/b',
};

function tab(overrides: Partial<TabSnapshot> & { id: string }): TabSnapshot {
  return {
    topLevelRepoPath: overrides.identity?.repoPath ?? '/repos/a',
    displayedRepoPath: overrides.identity?.repoPath ?? '/repos/a',
    identity: repoA,
    lastActiveSeq: 0,
    ...overrides,
  };
}

describe('pickReturnTarget', () => {
  it('answers null when no tab is open', () => {
    expect(pickReturnTarget([])).toBeNull();
  });

  it('answers the most recently active tab', () => {
    const tabs = [
      tab({ id: 'one', lastActiveSeq: 3 }),
      tab({ id: 'two', lastActiveSeq: 7 }),
      tab({ id: 'three', lastActiveSeq: 5 }),
    ];
    expect(pickReturnTarget(tabs)?.id).toBe('two');
  });

  it('follows a sequence of activations', () => {
    const tabs = [tab({ id: 'one', lastActiveSeq: 1 }), tab({ id: 'two', lastActiveSeq: 2 })];
    expect(pickReturnTarget(tabs)?.id).toBe('two');
    tabs[0].lastActiveSeq = 3;
    expect(pickReturnTarget(tabs)?.id).toBe('one');
  });
});

describe('pickRepoTarget', () => {
  it('answers null when no tab shows that repo', () => {
    expect(pickRepoTarget([tab({ id: 'one' })], '/repos/b')).toBeNull();
  });

  it('prefers the most recently active among several matches', () => {
    const tabs = [
      tab({ id: 'one', topLevelRepoPath: '/repos/a', lastActiveSeq: 2 }),
      tab({ id: 'two', topLevelRepoPath: '/repos/a', lastActiveSeq: 9 }),
      tab({ id: 'three', topLevelRepoPath: '/repos/b', lastActiveSeq: 11, identity: repoB }),
    ];
    expect(pickRepoTarget(tabs, '/repos/a')?.id).toBe('two');
  });

  it('matches a tab that is currently displaying a submodule of the named repo', () => {
    const tabs = [
      tab({
        id: 'one',
        topLevelRepoPath: '/repos/a',
        displayedRepoPath: '/repos/a/sub',
        identity: submoduleA,
        lastActiveSeq: 4,
      }),
    ];
    expect(pickRepoTarget(tabs, '/repos/a')?.id).toBe('one');
  });
});

describe('tabsAffectedByChange', () => {
  it('wakes a tab on the same repo', () => {
    const tabs = [tab({ id: 'one', identity: repoA })];
    expect(tabsAffectedByChange(tabs, repoA).map((t) => t.id)).toEqual(['one']);
  });

  it('wakes a sibling linked worktree through the shared common git dir', () => {
    const tabs = [tab({ id: 'worktree', identity: worktreeA })];
    expect(tabsAffectedByChange(tabs, repoA).map((t) => t.id)).toEqual(['worktree']);
  });

  it('wakes the parent when its submodule pointer moves', () => {
    const tabs = [tab({ id: 'parent', identity: repoA })];
    expect(tabsAffectedByChange(tabs, submoduleA).map((t) => t.id)).toEqual(['parent']);
  });

  it('does NOT wake the submodule when the parent commits', () => {
    const tabs = [tab({ id: 'sub', identity: submoduleA })];
    expect(tabsAffectedByChange(tabs, repoA)).toEqual([]);
  });

  it('leaves an unrelated repo alone', () => {
    const tabs = [tab({ id: 'b', identity: repoB })];
    expect(tabsAffectedByChange(tabs, repoA)).toEqual([]);
  });

  it('never wakes a tab whose identity could not be resolved', () => {
    const tabs = [tab({ id: 'unknown', identity: null })];
    expect(tabsAffectedByChange(tabs, repoA)).toEqual([]);
  });
});

describe('tabsOnWorkingTree', () => {
  it('includes every tab on the key, the originating one among them', () => {
    const origin = tab({ id: 'origin', identity: repoA });
    const peer = tab({ id: 'peer', identity: repoA });
    expect(tabsOnWorkingTree([origin, peer], repoA.gitDir).map((t) => t.id)).toEqual(['origin', 'peer']);
  });

  it('excludes a sibling worktree and an unresolved tab', () => {
    const tabs = [
      tab({ id: 'worktree', identity: worktreeA }),
      tab({ id: 'unknown', identity: null }),
      tab({ id: 'other', identity: repoB }),
    ];
    expect(tabsOnWorkingTree(tabs, repoA.gitDir)).toEqual([]);
  });

  it('answers nothing for an empty key', () => {
    expect(tabsOnWorkingTree([tab({ id: 'a', identity: repoA })], '')).toEqual([]);
  });
});

describe('tabsOrphanedByRepoRemoval', () => {
  const tabOnA = tab({ id: 'a', identity: repoA });

  it('keeps a tab whose top-level repo is still known', () => {
    expect(tabsOrphanedByRepoRemoval([tabOnA], ['/repos/a', '/repos/b'])).toEqual([]);
  });

  it('keeps a tab displaying a submodule of a still-known repo', () => {
    const inSubmodule = tab({
      id: 'sub', identity: submoduleA, topLevelRepoPath: '/repos/a', displayedRepoPath: '/repos/a/sub',
    });
    expect(tabsOrphanedByRepoRemoval([inSubmodule], ['/repos/a'])).toEqual([]);
  });

  it('keeps a tab whose repo is spelled with a trailing separator', () => {
    expect(tabsOrphanedByRepoRemoval([tabOnA], ['/repos/a/'])).toEqual([]);
  });

  it('orphans a tab whose repo is gone', () => {
    expect(tabsOrphanedByRepoRemoval([tabOnA], ['/repos/b']).map((t) => t.id)).toEqual(['a']);
  });

  it('does not treat a prefix-sharing sibling as the same repo', () => {
    expect(tabsOrphanedByRepoRemoval([tabOnA], ['/repos/a2']).map((t) => t.id)).toEqual(['a']);
  });

  it('orphans every tab when no repos remain', () => {
    expect(tabsOrphanedByRepoRemoval([tabOnA], []).map((t) => t.id)).toEqual(['a']);
  });
});

describe('panelTitleFor', () => {
  it('uses the folder name of the displayed repo', () => {
    expect(panelTitleFor('/repos/a')).toBe('a');
  });

  it('titles a displayed submodule by the submodule name', () => {
    expect(panelTitleFor('/repos/dev/sub-mod1')).toBe('sub-mod1');
  });

  it('ignores a trailing separator', () => {
    expect(panelTitleFor('/repos/a/')).toBe('a');
  });

  it('falls back for an empty path', () => {
    expect(panelTitleFor('')).toBe('Speedy Git');
  });
});
