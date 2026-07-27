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

describe('isOnFirstParentChain', () => {
  const root = makeCommit('1111111111111111111111111111111111111111');
  const middle = makeCommit('2222222222222222222222222222222222222222', [root.hash]);
  const head = makeCommit('3333333333333333333333333333333333333333', [middle.hash]);

  it('walks a linear history down from head, head itself included', () => {
    const checker = createReachabilityChecker([head, middle, root]);

    expect(checker.isOnFirstParentChain(head.hash, head.hash)).toBe(true);
    expect(checker.isOnFirstParentChain(middle.hash, head.hash)).toBe(true);
    expect(checker.isOnFirstParentChain(root.hash, head.hash)).toBe(true);
  });

  it('rejects a commit that is merely reachable through a side branch', () => {
    const base = makeCommit('1111111111111111111111111111111111111111');
    const mainline = makeCommit('2222222222222222222222222222222222222222', [base.hash]);
    const side = makeCommit('3333333333333333333333333333333333333333', [base.hash]);
    const merge = makeCommit('4444444444444444444444444444444444444444', [mainline.hash, side.hash]);
    const tip = makeCommit('5555555555555555555555555555555555555555', [merge.hash]);
    const commits = [tip, merge, side, mainline, base];
    const checker = createReachabilityChecker(commits);

    expect(checker.isReachableFromHead(side.hash, tip.hash)).toBe(true);
    expect(checker.isOnFirstParentChain(side.hash, tip.hash)).toBe(false);
  });

  it('stops at a merge commit, so history below one is off the chain', () => {
    const base = makeCommit('1111111111111111111111111111111111111111');
    const mainline = makeCommit('2222222222222222222222222222222222222222', [base.hash]);
    const side = makeCommit('3333333333333333333333333333333333333333', [base.hash]);
    const merge = makeCommit('4444444444444444444444444444444444444444', [mainline.hash, side.hash]);
    const tip = makeCommit('5555555555555555555555555555555555555555', [merge.hash]);
    const checker = createReachabilityChecker([tip, merge, side, mainline, base]);

    // The merge itself is on the chain; everything under it is not.
    expect(checker.isOnFirstParentChain(merge.hash, tip.hash)).toBe(true);
    expect(checker.isOnFirstParentChain(mainline.hash, tip.hash)).toBe(false);
    expect(checker.isOnFirstParentChain(base.hash, tip.hash)).toBe(false);
  });

  it('gives up when the chain runs past the loaded commits', () => {
    const known = makeCommit('2222222222222222222222222222222222222222', ['9999999999999999999999999999999999999999']);
    const checker = createReachabilityChecker([known]);

    // The unloaded parent is still recognisably on the chain...
    expect(checker.isOnFirstParentChain('9999999999999999999999999999999999999999', known.hash)).toBe(true);
    // ...but nothing beyond it can be, since its own parents are unknown.
    expect(checker.isOnFirstParentChain('8888888888888888888888888888888888888888', known.hash)).toBe(false);
  });

  it('resolves abbreviated hashes on both ends', () => {
    const checker = createReachabilityChecker([head, middle, root]);

    expect(checker.isOnFirstParentChain('111111', '333333')).toBe(true);
  });
});
