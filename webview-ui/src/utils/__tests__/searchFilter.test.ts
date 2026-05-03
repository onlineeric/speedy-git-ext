import { describe, it, expect } from 'vitest';
import type { Commit } from '@shared/types';
import { filterCommits } from '../searchFilter';

function commit(overrides: Partial<Commit>): Commit {
  return {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    abbreviatedHash: 'aaaaaaa',
    parents: [],
    author: 'Default',
    authorEmail: 'default@x',
    authorDate: 0,
    subject: 'default subject',
    refs: [],
    ...overrides,
  };
}

describe('filterCommits', () => {
  it('returns no matches for empty query', () => {
    const commits = [commit({ subject: 'hello world' })];
    expect(filterCommits(commits, '')).toEqual([]);
  });

  it('returns no matches for whitespace-only query', () => {
    const commits = [commit({ subject: 'hello world' })];
    expect(filterCommits(commits, '   ')).toEqual([]);
  });

  it('matches subject case-insensitively', () => {
    const commits = [
      commit({ subject: 'Add feature' }),
      commit({ subject: 'Fix bug' }),
      commit({ subject: 'docs: update README' }),
    ];
    expect(filterCommits(commits, 'fix')).toEqual([1]);
    expect(filterCommits(commits, 'FEATURE')).toEqual([0]);
  });

  it('matches author name', () => {
    const commits = [
      commit({ author: 'Alice' }),
      commit({ author: 'Bob' }),
    ];
    expect(filterCommits(commits, 'alice')).toEqual([0]);
  });

  it('matches commit hash by prefix only when query has 4+ chars', () => {
    const commits = [
      commit({ hash: 'abcd1234ffffffffffffffffffffffffffffffff', abbreviatedHash: 'abcd1234' }),
      commit({ hash: 'ef561234ffffffffffffffffffffffffffffffff', abbreviatedHash: 'ef561234' }),
    ];
    expect(filterCommits(commits, 'abc')).toEqual([]);  // only 3 chars, not enough
    expect(filterCommits(commits, 'abcd')).toEqual([0]);
    expect(filterCommits(commits, 'ABCD')).toEqual([0]);
  });

  it('does not match hash by substring (only prefix)', () => {
    const commits = [
      commit({ hash: 'abcd1234ffffffffffffffffffffffffffffffff', abbreviatedHash: 'abcd1234' }),
    ];
    expect(filterCommits(commits, '1234')).toEqual([]);
  });

  it('returns multiple match indices in order', () => {
    const commits = [
      commit({ subject: 'fix the thing' }),
      commit({ subject: 'add feature' }),
      commit({ subject: 'fix another thing' }),
    ];
    expect(filterCommits(commits, 'fix')).toEqual([0, 2]);
  });

  it('matches across subject, author, and hash', () => {
    const commits = [
      commit({ subject: 'feat: foo', author: 'bar', hash: 'fooo1234ffffffffffffffffffffffffffffffff', abbreviatedHash: 'fooo1234' }),
    ];
    expect(filterCommits(commits, 'foo')).toEqual([0]); // subject contains "foo"
  });
});
