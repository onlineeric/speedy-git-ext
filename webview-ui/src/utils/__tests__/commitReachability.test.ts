import { describe, expect, it } from 'vitest';
import type { Commit } from '@shared/types';
import { createReachabilityChecker, isReachableFromHead } from '../commitReachability';

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

describe('createReachabilityChecker', () => {
  it('answers multiple reachability queries against a shared commit map', () => {
    const root = makeCommit('1111111111111111111111111111111111111111');
    const middle = makeCommit('2222222222222222222222222222222222222222', [root.hash]);
    const sibling = makeCommit('3333333333333333333333333333333333333333', [root.hash]);
    const head = makeCommit('4444444444444444444444444444444444444444', [middle.hash]);

    const checker = createReachabilityChecker([head, middle, sibling, root]);
    expect(checker.isReachableFromHead(middle.hash, head.hash)).toBe(true);
    expect(checker.isReachableFromHead(root.hash, head.hash)).toBe(true);
    expect(checker.isReachableFromHead(sibling.hash, head.hash)).toBe(false);
  });

  it('resolves abbreviated hashes when the match is unique', () => {
    const root = makeCommit('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const head = makeCommit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', [root.hash]);
    const checker = createReachabilityChecker([head, root]);
    expect(checker.isReachableFromHead('aaaaaa', 'bbbbbb')).toBe(true);
  });

  it('returns false when the abbreviated hash is ambiguous', () => {
    const a = makeCommit('abc111111111111111111111111111111111aaaa');
    const b = makeCommit('abc222222222222222222222222222222222bbbb', [a.hash]);
    const checker = createReachabilityChecker([b, a]);
    // 'abc' matches both commits → resolution falls back to the literal prefix string,
    // which isn't a real hash, so reachability cannot be established.
    expect(checker.isReachableFromHead('abc', b.hash)).toBe(false);
  });
});
