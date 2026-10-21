import { describe, it, expect } from 'vitest';
import type { Commit, GraphFilters, RefInfo } from '@shared/types';
import { computeCommitVisibility, type VisibilityOptions } from '../commitVisibility';

const OPTION_OFF: VisibilityOptions = {
  alwaysShowBadgedCommits: false,
  badgeSettings: { showTags: true, showRemoteBranches: true },
};

function computeHiddenCommitHashes(commits: Commit[], filters: GraphFilters): Set<string> {
  return computeCommitVisibility(commits, filters, OPTION_OFF).hiddenCommitHashes;
}

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

const ref = (type: RefInfo['type'], name = 'r'): RefInfo => ({ name, type });

describe('computeCommitVisibility — filters', () => {
  it('returns empty set when no author/text filter is active', () => {
    const commits = [commit({ hash: 'a' }), commit({ hash: 'b' })];
    expect(computeHiddenCommitHashes(commits, {} as GraphFilters)).toEqual(new Set());
  });

  it('hides commits whose author email is not in the included set', () => {
    const commits = [
      commit({ hash: 'a', authorEmail: 'alice@example.com' }),
      commit({ hash: 'b', authorEmail: 'bob@example.com' }),
    ];
    const filters = { authors: ['alice@example.com'] } as GraphFilters;
    expect(computeHiddenCommitHashes(commits, filters)).toEqual(new Set(['b']));
  });

  it('never hides stash or uncommitted entries even with filters active', () => {
    const commits = [
      commit({ hash: 'stash1', authorEmail: 'eve@example.com', refs: [ref('stash', 'stash@{0}')] }),
      commit({ hash: 'uncomm', authorEmail: 'eve@example.com', refs: [ref('uncommitted')] }),
      commit({ hash: 'real', authorEmail: 'eve@example.com' }),
    ];
    const filters = { authors: ['alice@example.com'] } as GraphFilters;
    expect(computeHiddenCommitHashes(commits, filters)).toEqual(new Set(['real']));
  });

  it('hides commits whose subject does not match the text filter', () => {
    const commits = [
      commit({ hash: 'a', subject: 'fix the login bug' }),
      commit({ hash: 'b', subject: 'add new feature' }),
    ];
    const filters = { textFilter: 'login' } as GraphFilters;
    expect(computeHiddenCommitHashes(commits, filters)).toEqual(new Set(['b']));
  });

  it('matches by hash prefix when text query is at least 4 chars', () => {
    const commits = [commit({ hash: 'abcd1234', subject: 'unrelated' })];
    const filters = { textFilter: 'abcd' } as GraphFilters;
    expect(computeHiddenCommitHashes(commits, filters)).toEqual(new Set());
  });

  it('does not match by hash prefix for queries shorter than 4 chars', () => {
    const commits = [commit({ hash: 'abc1234', subject: 'unrelated' })];
    const filters = { textFilter: 'abc' } as GraphFilters;
    expect(computeHiddenCommitHashes(commits, filters)).toEqual(new Set(['abc1234']));
  });

  it('combines author and text filters with AND semantics', () => {
    const commits = [
      commit({ hash: 'a', authorEmail: 'alice@example.com', subject: 'fix login' }),
      commit({ hash: 'b', authorEmail: 'alice@example.com', subject: 'unrelated' }),
      commit({ hash: 'c', authorEmail: 'bob@example.com', subject: 'fix login' }),
    ];
    const filters = { authors: ['alice@example.com'], textFilter: 'login' } as GraphFilters;
    expect(computeHiddenCommitHashes(commits, filters)).toEqual(new Set(['b', 'c']));
  });
});

describe('computeCommitVisibility — always show badged commits', () => {
  const remote = (name: string, remoteName = 'origin'): RefInfo => ({ name, type: 'remote', remote: remoteName });
  const authorFilter = { authors: ['alice@example.com'] } as GraphFilters;
  const optionOn = (badgeSettings = { showTags: true, showRemoteBranches: true }): VisibilityOptions => ({
    alwaysShowBadgedCommits: true,
    badgeSettings,
  });
  const foreign = (hash: string, refs: RefInfo[] = []) => commit({ hash, authorEmail: 'bob@example.com', refs });

  it('leaves results unchanged and reports no badge-kept commits when the option is off', () => {
    const commits = [foreign('a', [ref('branch', 'main')]), foreign('b')];
    const result = computeCommitVisibility(commits, authorFilter, OPTION_OFF);
    expect(result.hiddenCommitHashes).toEqual(new Set(['a', 'b']));
    expect(result.badgeKeptCommitHashes).toEqual(new Set());
  });

  it('keeps a foreign commit with a local branch, and hides one without refs', () => {
    const commits = [foreign('a', [ref('branch', 'main')]), foreign('b')];
    const result = computeCommitVisibility(commits, authorFilter, optionOn());
    expect(result.badgeKeptCommitHashes).toEqual(new Set(['a']));
    expect(result.hiddenCommitHashes).toEqual(new Set(['b']));
  });

  it('does not mark a commit that passes the filter as badge-kept', () => {
    const commits = [commit({ hash: 'mine', refs: [ref('branch', 'feature')] })];
    const result = computeCommitVisibility(commits, authorFilter, optionOn());
    expect(result.badgeKeptCommitHashes).toEqual(new Set());
    expect(result.hiddenCommitHashes).toEqual(new Set());
  });

  it('counts a tag only while tags are shown', () => {
    const commits = [foreign('t', [ref('tag', 'v1.0')])];
    expect(computeCommitVisibility(commits, authorFilter, optionOn()).badgeKeptCommitHashes).toEqual(new Set(['t']));
    const hidden = computeCommitVisibility(commits, authorFilter, optionOn({ showTags: false, showRemoteBranches: true }));
    expect(hidden.hiddenCommitHashes).toEqual(new Set(['t']));
    expect(hidden.badgeKeptCommitHashes).toEqual(new Set());
  });

  it('counts a remote-only branch only while remote branches are shown', () => {
    const commits = [foreign('r', [remote('feature')])];
    expect(computeCommitVisibility(commits, authorFilter, optionOn()).badgeKeptCommitHashes).toEqual(new Set(['r']));
    const hidden = computeCommitVisibility(commits, authorFilter, optionOn({ showTags: true, showRemoteBranches: false }));
    expect(hidden.hiddenCommitHashes).toEqual(new Set(['r']));
  });

  it('keeps a local+remote branch when remote branches are hidden (degraded to local)', () => {
    const commits = [foreign('m', [ref('branch', 'main'), remote('main')])];
    const result = computeCommitVisibility(commits, authorFilter, optionOn({ showTags: true, showRemoteBranches: false }));
    expect(result.badgeKeptCommitHashes).toEqual(new Set(['m']));
  });

  it('keeps a detached HEAD commit', () => {
    const commits = [foreign('d', [ref('head', 'HEAD')])];
    expect(computeCommitVisibility(commits, authorFilter, optionOn()).badgeKeptCommitHashes).toEqual(new Set(['d']));
  });

  it('applies the same rules to the Message filter alone', () => {
    const commits = [
      commit({ hash: 'a', subject: 'unrelated', refs: [ref('branch', 'main')] }),
      commit({ hash: 'b', subject: 'unrelated' }),
    ];
    const result = computeCommitVisibility(commits, { textFilter: 'login' } as GraphFilters, optionOn());
    expect(result.badgeKeptCommitHashes).toEqual(new Set(['a']));
    expect(result.hiddenCommitHashes).toEqual(new Set(['b']));
  });

  it('returns empty sets when no Author or Message filter is active', () => {
    const commits = [foreign('a', [ref('branch', 'main')]), foreign('b')];
    const result = computeCommitVisibility(commits, {} as GraphFilters, optionOn());
    expect(result.hiddenCommitHashes).toEqual(new Set());
    expect(result.badgeKeptCommitHashes).toEqual(new Set());
  });

  it('never puts stash or uncommitted entries in either set', () => {
    const commits = [
      foreign('stash1', [ref('stash', 'stash@{0}')]),
      foreign('uncomm', [ref('uncommitted')]),
    ];
    const result = computeCommitVisibility(commits, authorFilter, optionOn());
    expect(result.hiddenCommitHashes).toEqual(new Set());
    expect(result.badgeKeptCommitHashes).toEqual(new Set());
  });
});
