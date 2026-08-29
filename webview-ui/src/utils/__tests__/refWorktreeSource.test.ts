import { describe, it, expect } from 'vitest';
import type { RefInfo } from '@shared/types';
import { refWorktreeSource } from '../refWorktreeSource';

describe('refWorktreeSource', () => {
  it('bases a local branch badge on the branch itself', () => {
    expect(refWorktreeSource({ type: 'branch', name: 'feature' })).toEqual({
      ref: 'feature',
      label: 'feature',
      kind: 'local-branch',
    });
  });

  it('hands a remote branch to git fully qualified, never as the bare name', () => {
    // The bare name would silently resolve to a same-named local branch, which is a
    // different commit whenever the two have diverged.
    expect(refWorktreeSource({ type: 'remote', name: 'feature', remote: 'origin' })).toEqual({
      ref: 'origin/feature',
      label: 'origin/feature',
      kind: 'remote-branch',
    });
  });

  it('offers a remote branch even when a local branch of the same name exists elsewhere', () => {
    // Regression: this used to be gated on "no local counterpart anywhere in the repo",
    // so a remote branch that had diverged from its local one — the usual reason to want
    // the worktree — was the one case with no menu item.
    const diverged: RefInfo = { type: 'remote', name: 'feature', remote: 'origin' };
    expect(refWorktreeSource(diverged)?.ref).toBe('origin/feature');
  });

  it('bases a tag badge on the tag', () => {
    expect(refWorktreeSource({ type: 'tag', name: 'v1.2.0' })).toEqual({
      ref: 'v1.2.0',
      label: 'v1.2.0',
      kind: 'tag',
    });
  });

  it('offers nothing for a stash', () => {
    expect(refWorktreeSource({ type: 'stash', name: 'stash@{0}' })).toBeNull();
  });

  it('offers nothing for a remote ref with no remote name to qualify it', () => {
    expect(refWorktreeSource({ type: 'remote', name: 'feature' })).toBeNull();
  });
});
