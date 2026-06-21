import { describe, it, expect } from 'vitest';
import type { Commit, RefInfo, SlotValue } from '@shared/types';
import { slotMatchesCommitRow } from '../compareMarker';

function commit(refs: RefInfo[], hash = 'abc123'): Commit {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parents: [],
    author: 'Dev',
    authorEmail: 'dev@test',
    authorDate: 0,
    subject: 'subject',
    refs,
  };
}

describe('slotMatchesCommitRow', () => {
  it('returns false for a null slot', () => {
    expect(slotMatchesCommitRow(null, commit([]))).toBe(false);
  });

  it('matches a commit slot by exact hash', () => {
    const slot: SlotValue = { kind: 'commit', hash: 'abc123' };
    expect(slotMatchesCommitRow(slot, commit([], 'abc123'))).toBe(true);
    expect(slotMatchesCommitRow(slot, commit([], 'def456'))).toBe(false);
  });

  describe('branch slot', () => {
    it('matches a local branch ref of the same name', () => {
      const slot: SlotValue = { kind: 'branch', name: 'main' };
      expect(slotMatchesCommitRow(slot, commit([{ name: 'main', type: 'branch' }]))).toBe(true);
    });

    it('does not match a remote ref when the slot is a local branch', () => {
      const slot: SlotValue = { kind: 'branch', name: 'main' };
      expect(
        slotMatchesCommitRow(slot, commit([{ name: 'main', type: 'remote', remote: 'origin' }]))
      ).toBe(false);
    });

    it('matches a remote branch ref by name and remote', () => {
      const slot: SlotValue = { kind: 'branch', name: 'main', remote: 'origin' };
      expect(
        slotMatchesCommitRow(slot, commit([{ name: 'main', type: 'remote', remote: 'origin' }]))
      ).toBe(true);
    });

    it('does not match a remote branch from a different remote', () => {
      const slot: SlotValue = { kind: 'branch', name: 'main', remote: 'origin' };
      expect(
        slotMatchesCommitRow(slot, commit([{ name: 'main', type: 'remote', remote: 'upstream' }]))
      ).toBe(false);
    });

    it('does not match when the branch name differs', () => {
      const slot: SlotValue = { kind: 'branch', name: 'main' };
      expect(slotMatchesCommitRow(slot, commit([{ name: 'dev', type: 'branch' }]))).toBe(false);
    });
  });

  it('matches a tag slot against a tag ref of the same name', () => {
    const slot: SlotValue = { kind: 'tag', name: 'v1' };
    expect(slotMatchesCommitRow(slot, commit([{ name: 'v1', type: 'tag' }]))).toBe(true);
    expect(slotMatchesCommitRow(slot, commit([{ name: 'v2', type: 'tag' }]))).toBe(false);
  });

  it('matches a head slot against a row carrying the HEAD pointer', () => {
    const slot: SlotValue = { kind: 'head' };
    expect(slotMatchesCommitRow(slot, commit([{ name: 'HEAD', type: 'head' }]))).toBe(true);
    expect(slotMatchesCommitRow(slot, commit([{ name: 'main', type: 'branch' }]))).toBe(false);
  });

  it('never matches workingTree, expression, or emptyTree slots', () => {
    const row = commit([{ name: 'main', type: 'branch' }], 'abc123');
    expect(slotMatchesCommitRow({ kind: 'workingTree' }, row)).toBe(false);
    expect(slotMatchesCommitRow({ kind: 'expression', text: 'abc123' }, row)).toBe(false);
    expect(slotMatchesCommitRow({ kind: 'emptyTree' }, row)).toBe(false);
  });
});
