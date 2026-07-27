import { describe, expect, it } from 'vitest';
import type { Commit, RefInfo } from '@shared/types';
import { getCommitMenuAvailability, isStashPseudoCommit } from '../commitMenuAvailability';

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

const ON_BRANCH = { currentBranchHash: 'head', isOnCurrentBranch: true };

describe('isStashPseudoCommit', () => {
  it('detects a stash entry by its ref', () => {
    expect(isStashPseudoCommit(makeCommit('abc', ['parent'], [{ name: 'stash@{0}', type: 'stash' }]))).toBe(true);
    expect(isStashPseudoCommit(makeCommit('abc'))).toBe(false);
  });
});

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
      isOnCurrentBranch: false,
    });

    expect(availability.isHeadCommit).toBe(false);
    expect(availability.canRebase).toBe(false);
    expect(availability.canReset).toBe(false);
    expect(availability.canDrop).toBe(false);
  });

  it('cannot drop a commit that is not on the current branch', () => {
    const availability = getCommitMenuAvailability({
      commit: makeCommit('abc'),
      currentBranchHash: 'head',
      isOnCurrentBranch: false,
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
});
