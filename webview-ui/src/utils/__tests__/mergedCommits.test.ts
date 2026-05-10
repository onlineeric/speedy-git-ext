import { describe, it, expect } from 'vitest';
import type { Branch, Commit, GraphFilters, StashEntry } from '@shared/types';
import { UNCOMMITTED_HASH } from '@shared/types';
import {
  mergeStashesIntoCommits,
  mergeUncommittedIntoCommits,
  computeMergedTopology,
  type UncommittedContext,
} from '../mergedCommits';

function commit(overrides: Partial<Commit>): Commit {
  return {
    hash: 'h',
    abbreviatedHash: 'h',
    parents: [],
    author: 'Alice',
    authorEmail: 'alice@example.com',
    authorDate: 0,
    subject: '',
    refs: [],
    ...overrides,
  };
}

function stash(overrides: Partial<StashEntry>): StashEntry {
  return {
    index: 0,
    hash: 's0',
    parentHash: 'p',
    message: 'WIP',
    date: 0,
    author: 'Alice',
    authorEmail: 'alice@example.com',
    ...overrides,
  };
}

describe('mergeStashesIntoCommits', () => {
  it('returns commits unchanged when there are no stashes', () => {
    const commits = [commit({ hash: 'a' })];
    expect(mergeStashesIntoCommits(commits, [])).toBe(commits);
  });

  it('inserts a stash at the index of its parent commit', () => {
    const commits = [commit({ hash: 'a' }), commit({ hash: 'b' }), commit({ hash: 'c' })];
    const stashes = [stash({ index: 0, hash: 's0', parentHash: 'b' })];

    const result = mergeStashesIntoCommits(commits, stashes);
    expect(result.map(c => c.hash)).toEqual(['a', 's0', 'b', 'c']);
    expect(result[1].refs).toEqual([{ name: 'stash@{0}', type: 'stash' }]);
  });

  it('skips stashes whose parent commit is not in the list', () => {
    const commits = [commit({ hash: 'a' })];
    const stashes = [stash({ parentHash: 'missing' })];
    expect(mergeStashesIntoCommits(commits, stashes)).toEqual(commits);
  });

  it('skips stashes outside the active date range', () => {
    const commits = [commit({ hash: 'a' })];
    const stashes = [
      stash({ index: 0, hash: 's_old', parentHash: 'a', date: 100 }),
      stash({ index: 1, hash: 's_now', parentHash: 'a', date: 500 }),
    ];
    const filters = { afterDate: new Date(200).toISOString() } as GraphFilters;
    const result = mergeStashesIntoCommits(commits, stashes, filters);
    expect(result.map(c => c.hash)).toEqual(['s_now', 'a']);
  });
});

describe('mergeUncommittedIntoCommits', () => {
  const counts = { stagedCount: 0, unstagedCount: 0, untrackedCount: 0 };

  it('returns commits unchanged when there are no uncommitted changes', () => {
    const commits = [commit({ hash: 'a' })];
    expect(mergeUncommittedIntoCommits(commits, false, counts, [])).toBe(commits);
  });

  it('returns commits unchanged when commits list is empty', () => {
    expect(mergeUncommittedIntoCommits([], true, counts, [])).toEqual([]);
  });

  it('injects a synthetic uncommitted node at index 0 pointing at HEAD', () => {
    const commits = [
      commit({ hash: 'head', refs: [{ name: 'main', type: 'head' }] }),
      commit({ hash: 'older' }),
    ];
    const result = mergeUncommittedIntoCommits(commits, true, counts, []);
    expect(result[0].hash).toBe(UNCOMMITTED_HASH);
    expect(result[0].parents).toEqual(['head']);
    expect(result.map(c => c.hash)).toEqual([UNCOMMITTED_HASH, 'head', 'older']);
  });

  it('falls back to the first commit when no head ref is present', () => {
    const commits = [commit({ hash: 'first' }), commit({ hash: 'second' })];
    const result = mergeUncommittedIntoCommits(commits, true, counts, []);
    expect(result[0].parents).toEqual(['first']);
  });

  it('does not inject when current branch is excluded by branch filter', () => {
    const commits = [commit({ hash: 'a' })];
    const branches: Branch[] = [{ name: 'feat', current: true, hash: 'a' }];
    const filters = { branches: ['main'] } as GraphFilters;
    const result = mergeUncommittedIntoCommits(commits, true, counts, branches, filters);
    expect(result).toBe(commits);
  });

  it('injects when current branch is included in branch filter', () => {
    const commits = [commit({ hash: 'a' })];
    const branches: Branch[] = [{ name: 'main', current: true, hash: 'a' }];
    const filters = { branches: ['main'] } as GraphFilters;
    const result = mergeUncommittedIntoCommits(commits, true, counts, branches, filters);
    expect(result[0].hash).toBe(UNCOMMITTED_HASH);
  });
});

describe('computeMergedTopology', () => {
  it('removes hidden commits from the displayed list while keeping visible ones indexed by row', () => {
    const commits = [
      commit({ hash: 'visible' }),
      commit({ hash: 'hidden' }),
    ];
    const hidden = new Set(['hidden']);
    const { mergedCommits, topology } = computeMergedTopology(commits, [], undefined, hidden);

    expect(mergedCommits.map(c => c.hash)).toEqual(['visible']);
    expect(topology.commitIndexByHash.get('visible')).toBe(0);
    expect(topology.commitIndexByHash.has('hidden')).toBe(false);
  });

  it('appends an uncommitted node at the head of merged commits when context is provided', () => {
    const commits = [commit({ hash: 'head', refs: [{ name: 'main', type: 'head' }] })];
    const uncommitted: UncommittedContext = {
      hasUncommittedChanges: true,
      counts: { stagedCount: 1, unstagedCount: 0, untrackedCount: 0 },
      branches: [],
    };
    const { mergedCommits } = computeMergedTopology(commits, [], undefined, undefined, uncommitted);
    expect(mergedCommits[0].hash).toBe(UNCOMMITTED_HASH);
  });
});
