import { describe, expect, it } from 'vitest';
import type { Commit, RefInfo } from '@shared/types';
import { getCommitMenuAvailability } from '../commitMenuAvailability';

function makeCommit(hash: string, parents: string[] = ['parent'], refs: RefInfo[] = []): Commit {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parents,
    author: 'Test User',
    authorEmail: 'test@example.com',
    authorDate: 1_000,
    subject: hash,
    refs,
  };
}

const ON_BRANCH = { currentBranchHash: 'head', isOnFirstParentChain: true };

describe('getCommitMenuAvailability', () => {
  it('offers the full set for an ordinary commit on the current branch', () => {
    const availability = getCommitMenuAvailability({ commit: makeCommit('abc'), ...ON_BRANCH });

    expect(availability).toMatchObject({
      isHeadCommit: false,
      canCherryPick: true,
      canRebase: true,
      canReset: true,
      canRevert: true,
      canDrop: true,
      canMerge: true,
    });
  });

  it('withholds the "move the branch here" actions when the branch is already here', () => {
    const availability = getCommitMenuAvailability({ commit: makeCommit('head'), ...ON_BRANCH });

    expect(availability.isHeadCommit).toBe(true);
    expect(availability.canRebase).toBe(false);
    expect(availability.canReset).toBe(false);
    expect(availability.canCherryPick).toBe(false);
    // Undoing the commit you are sitting on is still meaningful.
    expect(availability.canRevert).toBe(true);
    expect(availability.canDrop).toBe(true);
  });

  it('withholds branch-moving actions in a detached / branchless state', () => {
    const availability = getCommitMenuAvailability({
      commit: makeCommit('abc'),
      currentBranchHash: null,
      isOnFirstParentChain: false,
    });

    expect(availability.isHeadCommit).toBe(false);
    expect(availability.canRebase).toBe(false);
    expect(availability.canReset).toBe(false);
    expect(availability.canDrop).toBe(false);
  });

  it('cannot drop a commit off the current branch\'s linear history', () => {
    const availability = getCommitMenuAvailability({
      commit: makeCommit('abc'),
      currentBranchHash: 'head',
      isOnFirstParentChain: false,
    });

    expect(availability.canDrop).toBe(false);
    expect(availability.canCherryPick).toBe(true);
  });

  it('cannot drop a merge commit', () => {
    const availability = getCommitMenuAvailability({
      commit: makeCommit('abc', ['parent-a', 'parent-b']),
      ...ON_BRANCH,
    });

    expect(availability.isMergeCommit).toBe(true);
    expect(availability.canDrop).toBe(false);
    expect(availability.canRevert).toBe(true);
  });

  it('cannot revert or drop the root commit', () => {
    const availability = getCommitMenuAvailability({ commit: makeCommit('abc', []), ...ON_BRANCH });

    expect(availability.isRootCommit).toBe(true);
    expect(availability.canRevert).toBe(false);
    expect(availability.canDrop).toBe(false);
  });

  it('cannot revert or drop a stash entry', () => {
    const commit = makeCommit('abc', ['parent'], [{ name: 'stash@{0}', type: 'stash' }]);
    const availability = getCommitMenuAvailability({ commit, ...ON_BRANCH });

    expect(availability.isStash).toBe(true);
    expect(availability.canRevert).toBe(false);
    expect(availability.canDrop).toBe(false);
  });

  it('cannot merge a stash entry or the commit the branch is already on', () => {
    const stash = makeCommit('abc', ['parent'], [{ name: 'stash@{0}', type: 'stash' }]);
    expect(getCommitMenuAvailability({ commit: stash, ...ON_BRANCH }).canMerge).toBe(false);
    expect(getCommitMenuAvailability({ commit: makeCommit('head'), ...ON_BRANCH }).canMerge).toBe(false);
  });

  it('offers merge for a merge commit, and in detached HEAD', () => {
    // Nothing about `git merge <commit>` cares that the target is itself a merge,
    // and detached HEAD merges just as happily as a branch does.
    const mergeCommit = makeCommit('abc', ['p1', 'p2']);
    expect(getCommitMenuAvailability({ commit: mergeCommit, ...ON_BRANCH }).canMerge).toBe(true);
    expect(
      getCommitMenuAvailability({
        commit: makeCommit('abc'),
        currentBranchHash: null,
        isOnFirstParentChain: false,
      }).canMerge
    ).toBe(true);
  });
});
