import { describe, it, expect } from 'vitest';
import type { Branch } from '@shared/types';
import {
  combineBranchRefs,
  toDisplayRef,
  type BranchBadge,
} from '../filterUtils';

function localBranch(name: string): Branch {
  return { name, current: false, hash: 'h' };
}

function remoteBranch(name: string, remote: string): Branch {
  return { name, remote, current: false, hash: 'h' };
}

describe('combineBranchRefs', () => {
  it('returns empty array when no filter branches selected', () => {
    expect(combineBranchRefs([], [])).toEqual([]);
  });

  it('produces a hasLocal-only badge when only local branch is selected', () => {
    const badges = combineBranchRefs(['main'], [localBranch('main')]);
    expect(badges).toEqual<BranchBadge[]>([
      {
        key: 'local-main',
        primaryName: 'main',
        allNames: ['main'],
        hasLocal: true,
        remoteNames: [],
      },
    ]);
  });

  it('produces a remote-only badge when only origin/main is selected', () => {
    const badges = combineBranchRefs(['origin/main'], [remoteBranch('main', 'origin')]);
    expect(badges).toEqual<BranchBadge[]>([
      {
        key: 'remote-origin/main',
        primaryName: 'origin/main',
        allNames: ['origin/main'],
        hasLocal: false,
        remoteNames: ['origin/main'],
      },
    ]);
  });

  it('merges local + matching remote into one badge', () => {
    const badges = combineBranchRefs(
      ['main', 'origin/main'],
      [localBranch('main'), remoteBranch('main', 'origin')]
    );
    expect(badges).toHaveLength(1);
    expect(badges[0].hasLocal).toBe(true);
    expect(badges[0].remoteNames).toEqual(['origin/main']);
    expect(badges[0].allNames.sort()).toEqual(['main', 'origin/main']);
  });

  it('merges local with multiple matching remotes', () => {
    const badges = combineBranchRefs(
      ['main', 'origin/main', 'upstream/main'],
      [localBranch('main'), remoteBranch('main', 'origin'), remoteBranch('main', 'upstream')]
    );
    expect(badges).toHaveLength(1);
    expect(badges[0].remoteNames.sort()).toEqual(['origin/main', 'upstream/main']);
  });

  it('keeps unmatched remote-only branches as separate badges', () => {
    const badges = combineBranchRefs(
      ['main', 'origin/main', 'origin/staging'],
      [localBranch('main'), remoteBranch('main', 'origin'), remoteBranch('staging', 'origin')]
    );
    expect(badges).toHaveLength(2);
    const merged = badges.find((b) => b.primaryName === 'main');
    const remoteOnly = badges.find((b) => b.primaryName === 'origin/staging');
    expect(merged?.hasLocal).toBe(true);
    expect(remoteOnly?.hasLocal).toBe(false);
  });
});

describe('toDisplayRef', () => {
  it('converts merged badge to merged-branch displayRef', () => {
    const badge: BranchBadge = {
      key: 'k',
      primaryName: 'main',
      allNames: ['main', 'origin/main'],
      hasLocal: true,
      remoteNames: ['origin/main'],
    };
    expect(toDisplayRef(badge)).toEqual({
      type: 'merged-branch',
      localName: 'main',
      remoteNames: ['origin/main'],
    });
  });

  it('converts local-only badge to local-branch displayRef', () => {
    const badge: BranchBadge = {
      key: 'k',
      primaryName: 'feat',
      allNames: ['feat'],
      hasLocal: true,
      remoteNames: [],
    };
    expect(toDisplayRef(badge)).toEqual({ type: 'local-branch', localName: 'feat' });
  });

  it('converts remote-only badge to remote-branch displayRef', () => {
    const badge: BranchBadge = {
      key: 'k',
      primaryName: 'origin/feat',
      allNames: ['origin/feat'],
      hasLocal: false,
      remoteNames: ['origin/feat'],
    };
    expect(toDisplayRef(badge)).toEqual({ type: 'remote-branch', remoteName: 'origin/feat' });
  });
});
