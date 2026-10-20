import { describe, it, expect } from 'vitest';
import { isBadgedCommit, mergeRefs } from '../mergeRefs';
import type { Commit, RefInfo } from '@shared/types';

describe('mergeRefs', () => {
  it('returns isHead=false and empty displayRefs for empty array', () => {
    const result = mergeRefs([]);
    expect(result.isHead).toBe(false);
    expect(result.displayRefs).toEqual([]);
  });

  it('detects HEAD from type="head" ref', () => {
    const refs: RefInfo[] = [{ type: 'head', name: 'HEAD' }];
    const result = mergeRefs(refs);
    expect(result.isHead).toBe(true);
    expect(result.displayRefs).toEqual([]);
  });

  it('returns headBranchName for a checked-out branch, null when detached or not HEAD', () => {
    expect(mergeRefs([{ type: 'head', name: 'dev' }]).headBranchName).toBe('dev');
    expect(mergeRefs([{ type: 'head', name: 'HEAD' }]).headBranchName).toBeNull();
    expect(mergeRefs([{ type: 'branch', name: 'dev' }]).headBranchName).toBeNull();
  });

  it('emits local-branch for a local branch with no matching remote', () => {
    const refs: RefInfo[] = [{ type: 'branch', name: 'feature' }];
    const result = mergeRefs(refs);
    expect(result.isHead).toBe(false);
    expect(result.displayRefs).toEqual([
      { type: 'local-branch', localName: 'feature' },
    ]);
  });

  it('emits remote-branch for a remote with no matching local', () => {
    const refs: RefInfo[] = [{ type: 'remote', name: 'feat', remote: 'origin' }];
    const result = mergeRefs(refs);
    expect(result.displayRefs).toEqual([
      { type: 'remote-branch', remoteName: 'origin/feat' },
    ]);
  });

  it('merges local+single-remote into merged-branch', () => {
    const refs: RefInfo[] = [
      { type: 'branch', name: 'main' },
      { type: 'remote', name: 'main', remote: 'origin' },
    ];
    const result = mergeRefs(refs);
    expect(result.displayRefs).toEqual([
      { type: 'merged-branch', localName: 'main', remoteNames: ['origin/main'] },
    ]);
  });

  it('merges local+multi-remote (origin+upstream) into merged-branch', () => {
    const refs: RefInfo[] = [
      { type: 'branch', name: 'main' },
      { type: 'remote', name: 'main', remote: 'origin' },
      { type: 'remote', name: 'main', remote: 'upstream' },
    ];
    const result = mergeRefs(refs);
    expect(result.displayRefs).toEqual([
      {
        type: 'merged-branch',
        localName: 'main',
        remoteNames: ['origin/main', 'upstream/main'],
      },
    ]);
  });

  it('emits tag displayRef for a tag ref', () => {
    const refs: RefInfo[] = [{ type: 'tag', name: 'v1.0.0' }];
    const result = mergeRefs(refs);
    expect(result.displayRefs).toEqual([{ type: 'tag', tagName: 'v1.0.0' }]);
  });

  it('emits stash displayRef for a stash ref', () => {
    const refs: RefInfo[] = [{ type: 'stash', name: 'stash@{0}' }];
    const result = mergeRefs(refs);
    expect(result.displayRefs).toEqual([{ type: 'stash', stashRef: 'stash@{0}' }]);
  });

  it('handles detached HEAD (type="head" with no branch)', () => {
    const refs: RefInfo[] = [{ type: 'head', name: 'HEAD' }];
    const result = mergeRefs(refs);
    expect(result.isHead).toBe(true);
    expect(result.displayRefs).toEqual([]);
  });

  it('handles commit with both branches and tags', () => {
    const refs: RefInfo[] = [
      { type: 'head', name: 'HEAD' },
      { type: 'branch', name: 'release' },
      { type: 'tag', name: 'v2.0.0' },
    ];
    const result = mergeRefs(refs);
    expect(result.isHead).toBe(true);
    expect(result.displayRefs).toEqual([
      { type: 'local-branch', localName: 'release' },
      { type: 'tag', tagName: 'v2.0.0' },
    ]);
  });

  it('handles multiple unmatched locals and one remote', () => {
    const refs: RefInfo[] = [
      { type: 'branch', name: 'feature-a' },
      { type: 'branch', name: 'feature-b' },
      { type: 'remote', name: 'feature-a', remote: 'origin' },
    ];
    const result = mergeRefs(refs);
    expect(result.displayRefs).toEqual([
      { type: 'merged-branch', localName: 'feature-a', remoteNames: ['origin/feature-a'] },
      { type: 'local-branch', localName: 'feature-b' },
    ]);
  });

  it('merges HEAD-branch with its remote into merged-branch (HEAD -> dev + origin/dev)', () => {
    // Reproduces bug: git log %D yields "HEAD -> dev, origin/dev"
    // parseRefPart turns "HEAD -> dev" into { type: 'head', name: 'dev' }
    // mergeRefs must still match it against origin/dev
    const refs: RefInfo[] = [
      { type: 'head', name: 'dev' },
      { type: 'remote', name: 'dev', remote: 'origin' },
    ];
    const result = mergeRefs(refs);
    expect(result.isHead).toBe(true);
    expect(result.displayRefs).toEqual([
      { type: 'merged-branch', localName: 'dev', remoteNames: ['origin/dev'] },
    ]);
  });

  it('does not consume a remote matched to one local when another local has same name by coincidence', () => {
    // Two unrelated remotes, only one has a local
    const refs: RefInfo[] = [
      { type: 'branch', name: 'dev' },
      { type: 'remote', name: 'dev', remote: 'origin' },
      { type: 'remote', name: 'staging', remote: 'origin' },
    ];
    const result = mergeRefs(refs);
    expect(result.displayRefs).toEqual([
      { type: 'merged-branch', localName: 'dev', remoteNames: ['origin/dev'] },
      { type: 'remote-branch', remoteName: 'origin/staging' },
    ]);
  });
});

describe('isBadgedCommit', () => {
  const all = { showTags: true, showRemoteBranches: true };
  const withRefs = (refs: RefInfo[]): Commit => ({
    hash: 'h', abbreviatedHash: 'h', parents: [], author: 'A', authorEmail: 'a@x', authorDate: 0, subject: '', refs,
  });

  it('is false for a commit without refs', () => {
    expect(isBadgedCommit(withRefs([]), all)).toBe(false);
  });

  it('is true for HEAD, attached or detached', () => {
    expect(isBadgedCommit(withRefs([{ name: 'HEAD', type: 'head' }]), all)).toBe(true);
    expect(isBadgedCommit(withRefs([{ name: 'main', type: 'head' }]), { showTags: false, showRemoteBranches: false })).toBe(true);
  });

  it('follows the View settings for tags and remote-only branches', () => {
    const tag = withRefs([{ name: 'v1', type: 'tag' }]);
    const remote = withRefs([{ name: 'feat', type: 'remote', remote: 'origin' }]);
    expect(isBadgedCommit(tag, all)).toBe(true);
    expect(isBadgedCommit(tag, { showTags: false, showRemoteBranches: true })).toBe(false);
    expect(isBadgedCommit(remote, all)).toBe(true);
    expect(isBadgedCommit(remote, { showTags: true, showRemoteBranches: false })).toBe(false);
  });

  it('does not count a stash badge', () => {
    expect(isBadgedCommit(withRefs([{ name: 'stash@{0}', type: 'stash' }]), all)).toBe(false);
  });
});
