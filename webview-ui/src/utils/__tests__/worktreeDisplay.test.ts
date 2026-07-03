import { describe, expect, it } from 'vitest';
import type { WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../../types/displayRefs';
import {
  detachedWorktreeBadgeText,
  prioritizeWorktreeDisplayRefs,
  worktreeBranchLabel,
  worktreeFolderName,
  worktreeForDisplayRef,
} from '../worktreeDisplay';

const makeWorktree = (overrides: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  path: '/repo.worktrees/feature',
  head: 'aaaa1111',
  branch: 'refs/heads/feature',
  isMain: false,
  isDetached: false,
  isCurrent: false,
  isPrunable: false,
  ...overrides,
});

describe('worktreeDisplay', () => {
  it('formats branch and detached worktree labels', () => {
    expect(worktreeBranchLabel(makeWorktree({ branch: 'refs/heads/feature/x' }))).toBe('feature/x');
    expect(worktreeBranchLabel(makeWorktree({ branch: 'topic' }))).toBe('topic');
    expect(worktreeBranchLabel(makeWorktree({ branch: '', isDetached: true }))).toBe('detached');
  });

  it('extracts folder names from slash and backslash paths', () => {
    expect(worktreeFolderName('/repo.worktrees/19eae44a9d')).toBe('19eae44a9d');
    expect(worktreeFolderName('/repo.worktrees/19eae44a9d-2/')).toBe('19eae44a9d-2');
    expect(worktreeFolderName('C:\\repo.worktrees\\topic')).toBe('topic');
  });

  it('matches only local and merged refs to branch worktrees', () => {
    const worktree = makeWorktree();
    const worktreeByBranch = new Map([[worktreeBranchLabel(worktree), worktree]]);

    expect(worktreeForDisplayRef({ type: 'local-branch', localName: 'feature' }, worktreeByBranch)).toBe(worktree);
    expect(worktreeForDisplayRef({ type: 'merged-branch', localName: 'feature', remoteNames: ['origin/feature'] }, worktreeByBranch)).toBe(worktree);
    expect(worktreeForDisplayRef({ type: 'remote-branch', remoteName: 'origin/feature' }, worktreeByBranch)).toBeUndefined();
    expect(worktreeForDisplayRef({ type: 'tag', tagName: 'v1' }, worktreeByBranch)).toBeUndefined();
  });

  it('prioritizes worktree refs before ordinary refs while preserving group order', () => {
    const refs: DisplayRef[] = [
      { type: 'local-branch', localName: 'main' },
      { type: 'tag', tagName: 'v1' },
      { type: 'merged-branch', localName: 'feature', remoteNames: ['origin/feature'] },
      { type: 'local-branch', localName: 'release' },
    ];
    const prioritized = prioritizeWorktreeDisplayRefs(refs, new Map([
      ['feature', makeWorktree({ branch: 'refs/heads/feature' })],
      ['release', makeWorktree({ branch: 'refs/heads/release' })],
    ]));

    expect(prioritized).toEqual([
      { type: 'merged-branch', localName: 'feature', remoteNames: ['origin/feature'] },
      { type: 'local-branch', localName: 'release' },
      { type: 'local-branch', localName: 'main' },
      { type: 'tag', tagName: 'v1' },
    ]);
  });

  it('keeps the checked-out branch first, ahead of worktree refs', () => {
    const refs: DisplayRef[] = [
      { type: 'merged-branch', localName: 'dev', remoteNames: ['origin/dev'] },
      { type: 'local-branch', localName: 'dev2' },
    ];
    const prioritized = prioritizeWorktreeDisplayRefs(
      refs,
      new Map([['dev2', makeWorktree({ branch: 'refs/heads/dev2' })]]),
      'dev',
    );

    expect(prioritized).toEqual([
      { type: 'merged-branch', localName: 'dev', remoteNames: ['origin/dev'] },
      { type: 'local-branch', localName: 'dev2' },
    ]);
  });

  it('keeps the checked-out branch first even when it is itself a worktree branch', () => {
    const refs: DisplayRef[] = [
      { type: 'local-branch', localName: 'other' },
      { type: 'local-branch', localName: 'dev2' },
    ];
    const prioritized = prioritizeWorktreeDisplayRefs(
      refs,
      new Map([
        ['other', makeWorktree({ branch: 'refs/heads/other' })],
        ['dev2', makeWorktree({ branch: 'refs/heads/dev2' })],
      ]),
      'dev2',
    );

    expect(prioritized).toEqual([
      { type: 'local-branch', localName: 'dev2' },
      { type: 'local-branch', localName: 'other' },
    ]);
  });

  it('builds detached badge text for single and aggregate badges', () => {
    expect(detachedWorktreeBadgeText([makeWorktree({ path: '/repo.worktrees/19eae44a9d' })])).toBe('detached 19eae44a9d');
    expect(detachedWorktreeBadgeText([
      makeWorktree({ path: '/repo.worktrees/19eae44a9d' }),
      makeWorktree({ path: '/repo.worktrees/19eae44a9d-2' }),
    ])).toBe('detached ×2');
  });
});
