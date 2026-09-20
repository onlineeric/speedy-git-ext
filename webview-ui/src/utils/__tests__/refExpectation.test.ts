import { describe, it, expect } from 'vitest';
import type { Branch } from '@shared/types';
import {
  expectCurrentBranch,
  expectHead,
  expectLocalBranch,
  expectRebaseTarget,
  expectRemoteBranch,
} from '../refExpectation';

const BRANCHES: Branch[] = [
  { name: 'main', current: true, hash: 'a'.repeat(40) },
  { name: 'feature', current: false, hash: 'b'.repeat(40) },
  { name: 'main', remote: 'origin', current: false, hash: 'c'.repeat(40) },
  { name: 'origin/dev', remote: 'origin', current: false, hash: 'd'.repeat(40) },
];

const COMMITS = [
  { hash: 'a'.repeat(40), refs: [{ type: 'head' }, { type: 'branch' }] },
  { hash: 'b'.repeat(40), refs: [{ type: 'branch' }] },
];

describe('expectHead', () => {
  it('reads the hash from the HEAD-decorated row', () => {
    expect(expectHead(COMMITS)).toEqual({ ref: 'HEAD', expectedHash: 'a'.repeat(40) });
  });

  it('answers undefined when HEAD is not in the loaded rows', () => {
    expect(expectHead([{ hash: 'e'.repeat(40), refs: [] }])).toBeUndefined();
  });
});

describe('expectLocalBranch', () => {
  it('finds the local branch, not a same-named remote one', () => {
    expect(expectLocalBranch(BRANCHES, 'main')).toEqual({ ref: 'main', expectedHash: 'a'.repeat(40) });
  });

  it('answers undefined for an unknown branch', () => {
    expect(expectLocalBranch(BRANCHES, 'nope')).toBeUndefined();
  });
});

describe('expectRemoteBranch', () => {
  it('qualifies the ref as <remote>/<name>, never the bare name', () => {
    expect(expectRemoteBranch(BRANCHES, 'origin', 'main')).toEqual({
      ref: 'origin/main',
      expectedHash: 'c'.repeat(40),
    });
  });

  it('matches an entry already stored under its qualified name', () => {
    expect(expectRemoteBranch(BRANCHES, 'origin', 'dev')).toEqual({
      ref: 'origin/dev',
      expectedHash: 'd'.repeat(40),
    });
  });

  it('answers undefined for an unknown remote branch', () => {
    expect(expectRemoteBranch(BRANCHES, 'upstream', 'main')).toBeUndefined();
  });
});

describe('expectCurrentBranch', () => {
  it('names the checked-out local branch', () => {
    expect(expectCurrentBranch(BRANCHES, COMMITS)).toEqual({ ref: 'main', expectedHash: 'a'.repeat(40) });
  });

  it('falls back to HEAD in detached HEAD, which is what reset moves there', () => {
    const detached: Branch[] = [{ name: 'main', current: false, hash: 'a'.repeat(40) }];
    expect(expectCurrentBranch(detached, COMMITS)).toEqual({ ref: 'HEAD', expectedHash: 'a'.repeat(40) });
  });
});

describe('expectRebaseTarget', () => {
  it('matches a local branch by name', () => {
    expect(expectRebaseTarget(BRANCHES, 'main')).toEqual({ ref: 'main', expectedHash: 'a'.repeat(40) });
  });

  it('matches a remote branch by its qualified name', () => {
    expect(expectRebaseTarget(BRANCHES, 'origin/main')).toEqual({
      ref: 'origin/main',
      expectedHash: 'c'.repeat(40),
    });
  });

  it('answers undefined for a bare commit hash, which cannot move', () => {
    expect(expectRebaseTarget(BRANCHES, 'f'.repeat(40))).toBeUndefined();
  });
});
