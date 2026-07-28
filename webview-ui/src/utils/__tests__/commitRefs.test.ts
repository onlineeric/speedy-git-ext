import { describe, expect, it } from 'vitest';
import type { Commit, RefInfo } from '@shared/types';
import { findHeadCommit, findHeadCommitHash, isStashPseudoCommit } from '../commitRefs';

function makeCommit(hash: string, refs: RefInfo[] = []): Commit {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parents: ['parent'],
    author: 'Test User',
    authorEmail: 'test@example.com',
    authorDate: 1_000,
    subject: hash,
    refs,
  };
}

describe('findHeadCommit', () => {
  it('returns the row carrying the HEAD ref', () => {
    const commits = [
      { hash: 'aaa', refs: [{ type: 'branch' }] },
      { hash: 'bbb', refs: [{ type: 'head' }, { type: 'remote' }] },
    ];
    expect(findHeadCommit(commits)?.hash).toBe('bbb');
  });

  it('returns undefined when no row is HEAD', () => {
    expect(findHeadCommit([{ hash: 'aaa', refs: [{ type: 'tag' }] }])).toBeUndefined();
  });
});

describe('findHeadCommitHash', () => {
  it('returns the hash of the row carrying the HEAD ref', () => {
    const commits = [
      { hash: 'aaa', refs: [{ type: 'branch' }] },
      { hash: 'bbb', refs: [{ type: 'head' }, { type: 'remote' }] },
    ];
    expect(findHeadCommitHash(commits)).toBe('bbb');
  });

  it('returns null when no displayed row is HEAD', () => {
    expect(findHeadCommitHash([{ hash: 'aaa', refs: [{ type: 'tag' }] }])).toBeNull();
  });

  it('tolerates rows without refs (uncommitted node, stashes)', () => {
    expect(findHeadCommitHash([{ hash: 'uncommitted' }])).toBeNull();
    expect(findHeadCommitHash([])).toBeNull();
  });
});

describe('isStashPseudoCommit', () => {
  it('detects a stash entry by its ref', () => {
    expect(isStashPseudoCommit(makeCommit('abc', [{ name: 'stash@{0}', type: 'stash' }]))).toBe(true);
    expect(isStashPseudoCommit(makeCommit('abc'))).toBe(false);
  });
});
