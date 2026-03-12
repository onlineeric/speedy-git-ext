import { describe, expect, it } from 'vitest';
import type { Commit } from '@shared/types';
import { isReachableFromHead } from '../commitReachability';

function makeCommit(hash: string, parents: string[] = []): Commit {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parents,
    author: 'Test User',
    authorEmail: 'test@example.com',
    authorDate: 1_000,
    subject: hash,
    refs: [],
  };
}

describe('isReachableFromHead', () => {
  it('treats an abbreviated head hash as the full commit when the match is unique', () => {
    const root = makeCommit('1111111111111111111111111111111111111111');
    const middle = makeCommit('2222222222222222222222222222222222222222', [root.hash]);
    const head = makeCommit('37714acf43000000000000000000000000000000', [middle.hash]);

    expect(isReachableFromHead(head.hash, '37714ac', [head, middle, root])).toBe(true);
    expect(isReachableFromHead(middle.hash, '37714ac', [head, middle, root])).toBe(true);
  });

  it('returns false when the target commit is not reachable from head', () => {
    const root = makeCommit('1111111111111111111111111111111111111111');
    const side = makeCommit('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', [root.hash]);
    const head = makeCommit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', [root.hash]);

    expect(isReachableFromHead(side.hash, head.hash, [head, side, root])).toBe(false);
  });
});
