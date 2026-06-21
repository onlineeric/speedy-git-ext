import { describe, it, expect } from 'vitest';
import type { SlotValue } from '@shared/types';
import { slotsEqual, slotLabel } from '../compareSlot';

describe('slotsEqual', () => {
  it('treats two nulls as equal and null vs value as unequal', () => {
    expect(slotsEqual(null, null)).toBe(true);
    expect(slotsEqual(null, { kind: 'head' })).toBe(false);
    expect(slotsEqual({ kind: 'head' }, null)).toBe(false);
  });

  it('returns true for the same reference', () => {
    const v: SlotValue = { kind: 'commit', hash: 'abc' };
    expect(slotsEqual(v, v)).toBe(true);
  });

  it('returns false when kinds differ', () => {
    expect(slotsEqual({ kind: 'head' }, { kind: 'workingTree' })).toBe(false);
  });

  it('treats singleton kinds as equal regardless of identity', () => {
    expect(slotsEqual({ kind: 'head' }, { kind: 'head' })).toBe(true);
    expect(slotsEqual({ kind: 'workingTree' }, { kind: 'workingTree' })).toBe(true);
    expect(slotsEqual({ kind: 'emptyTree' }, { kind: 'emptyTree' })).toBe(true);
  });

  it('compares branch name and remote (treating undefined remote as null)', () => {
    expect(slotsEqual({ kind: 'branch', name: 'main' }, { kind: 'branch', name: 'main' })).toBe(true);
    expect(
      slotsEqual({ kind: 'branch', name: 'main' }, { kind: 'branch', name: 'main', remote: undefined })
    ).toBe(true);
    expect(
      slotsEqual({ kind: 'branch', name: 'main', remote: 'origin' }, { kind: 'branch', name: 'main' })
    ).toBe(false);
    expect(
      slotsEqual(
        { kind: 'branch', name: 'main', remote: 'origin' },
        { kind: 'branch', name: 'main', remote: 'upstream' }
      )
    ).toBe(false);
    expect(
      slotsEqual({ kind: 'branch', name: 'main' }, { kind: 'branch', name: 'dev' })
    ).toBe(false);
  });

  it('compares tag names', () => {
    expect(slotsEqual({ kind: 'tag', name: 'v1' }, { kind: 'tag', name: 'v1' })).toBe(true);
    expect(slotsEqual({ kind: 'tag', name: 'v1' }, { kind: 'tag', name: 'v2' })).toBe(false);
  });

  it('compares commit hashes case-insensitively', () => {
    expect(slotsEqual({ kind: 'commit', hash: 'ABC123' }, { kind: 'commit', hash: 'abc123' })).toBe(true);
    expect(slotsEqual({ kind: 'commit', hash: 'abc' }, { kind: 'commit', hash: 'def' })).toBe(false);
  });

  it('compares expressions after trimming', () => {
    expect(slotsEqual({ kind: 'expression', text: 'HEAD~1' }, { kind: 'expression', text: '  HEAD~1 ' })).toBe(true);
    expect(slotsEqual({ kind: 'expression', text: 'HEAD~1' }, { kind: 'expression', text: 'HEAD~2' })).toBe(false);
  });
});

describe('slotLabel', () => {
  it('labels singleton kinds', () => {
    expect(slotLabel({ kind: 'workingTree' })).toBe('Working Tree');
    expect(slotLabel({ kind: 'head' })).toBe('HEAD');
    expect(slotLabel({ kind: 'emptyTree' })).toBe('Empty Tree');
  });

  it('labels a local branch by name and a remote branch as remote/name', () => {
    expect(slotLabel({ kind: 'branch', name: 'main' })).toBe('main');
    expect(slotLabel({ kind: 'branch', name: 'main', remote: 'origin' })).toBe('origin/main');
  });

  it('labels a tag by name', () => {
    expect(slotLabel({ kind: 'tag', name: 'v1.2.3' })).toBe('v1.2.3');
  });

  it('labels a commit with its 7-char short hash', () => {
    expect(slotLabel({ kind: 'commit', hash: '0123456789abcdef' })).toBe('0123456');
  });

  it('labels an expression with its raw text', () => {
    expect(slotLabel({ kind: 'expression', text: 'origin/main^2' })).toBe('origin/main^2');
  });
});
