import { describe, it, expect } from 'vitest';
import { defaultMode } from '../compareDefaults';

describe('defaultMode', () => {
  it('returns two-dot when either slot is workingTree', () => {
    expect(defaultMode({ kind: 'workingTree' }, { kind: 'branch', name: 'main' })).toBe('two-dot');
    expect(defaultMode({ kind: 'branch', name: 'main' }, { kind: 'workingTree' })).toBe('two-dot');
    expect(defaultMode({ kind: 'workingTree' }, { kind: 'workingTree' })).toBe('two-dot');
  });

  it('returns three-dot when both slots are branches', () => {
    expect(defaultMode({ kind: 'branch', name: 'main' }, { kind: 'branch', name: 'feat' })).toBe('three-dot');
  });

  it('returns three-dot for branch x tag', () => {
    expect(defaultMode({ kind: 'branch', name: 'main' }, { kind: 'tag', name: 'v1.0' })).toBe('three-dot');
    expect(defaultMode({ kind: 'tag', name: 'v1.0' }, { kind: 'branch', name: 'main' })).toBe('three-dot');
  });

  it('returns three-dot for tag x tag', () => {
    expect(defaultMode({ kind: 'tag', name: 'v1.0' }, { kind: 'tag', name: 'v2.0' })).toBe('three-dot');
  });

  it('returns two-dot for any slot containing commit hash', () => {
    expect(defaultMode({ kind: 'commit', hash: 'a'.repeat(40) }, { kind: 'branch', name: 'main' })).toBe('two-dot');
    expect(defaultMode({ kind: 'branch', name: 'main' }, { kind: 'commit', hash: 'a'.repeat(40) })).toBe('two-dot');
    expect(defaultMode({ kind: 'commit', hash: 'a'.repeat(40) }, { kind: 'commit', hash: 'b'.repeat(40) })).toBe('two-dot');
  });

  it('returns two-dot for any slot containing expression', () => {
    expect(defaultMode({ kind: 'expression', text: 'HEAD~3' }, { kind: 'branch', name: 'main' })).toBe('two-dot');
    expect(defaultMode({ kind: 'expression', text: 'HEAD~3' }, { kind: 'expression', text: 'HEAD~5' })).toBe('two-dot');
  });

  it('returns two-dot for HEAD vs branch (HEAD is not a "ref" in default-mode terms)', () => {
    expect(defaultMode({ kind: 'head' }, { kind: 'branch', name: 'main' })).toBe('two-dot');
  });

  it('returns two-dot for emptyTree x commit (used by Compare these commits with root)', () => {
    expect(defaultMode({ kind: 'emptyTree' }, { kind: 'commit', hash: 'a'.repeat(40) })).toBe('two-dot');
  });

  it('returns two-dot when either slot is null', () => {
    expect(defaultMode(null, { kind: 'branch', name: 'main' })).toBe('two-dot');
    expect(defaultMode({ kind: 'branch', name: 'main' }, null)).toBe('two-dot');
    expect(defaultMode(null, null)).toBe('two-dot');
  });
});
