import { describe, expect, it } from 'vitest';
import { getRefMergeSource } from '../refMergeSource';

describe('getRefMergeSource', () => {
  it('offers a local branch by its bare name', () => {
    expect(getRefMergeSource({ type: 'branch', name: 'feature' }, false))
      .toEqual({ kind: 'branch', ref: 'feature' });
  });

  it('offers a remote branch qualified by its remote', () => {
    // The bare name would resolve to a same-named local branch instead.
    expect(getRefMergeSource({ type: 'remote', name: 'feature', remote: 'origin' }, false))
      .toEqual({ kind: 'remote-branch', ref: 'origin/feature' });
  });

  it('offers a tag, which git merges like any other commit-ish', () => {
    expect(getRefMergeSource({ type: 'tag', name: 'v1.0.0' }, false))
      .toEqual({ kind: 'tag', ref: 'v1.0.0' });
  });

  it('offers nothing for the branch already checked out', () => {
    expect(getRefMergeSource({ type: 'branch', name: 'main' }, true)).toBeNull();
  });

  it('offers nothing for a stash', () => {
    expect(getRefMergeSource({ type: 'stash', name: 'stash@{0}' }, false)).toBeNull();
  });

  it('offers nothing for ref types a badge never merges', () => {
    expect(getRefMergeSource({ type: 'head', name: 'HEAD' }, false)).toBeNull();
    expect(getRefMergeSource({ type: 'uncommitted', name: '' }, false)).toBeNull();
  });
});
