import { describe, it, expect } from 'vitest';
import type { Commit, GraphFilters, RefInfo } from '@shared/types';
import { computeHiddenCommitHashes } from '../commitVisibility';

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

describe('computeHiddenCommitHashes', () => {
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
