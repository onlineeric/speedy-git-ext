import type { WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';

const LOCAL_BRANCH_PREFIX = 'refs/heads/';

export function stripLocalBranchPrefix(branch: string): string {
  return branch.startsWith(LOCAL_BRANCH_PREFIX) ? branch.slice(LOCAL_BRANCH_PREFIX.length) : branch;
}

export function worktreeBranchLabel(worktree: WorktreeInfo): string {
  if (worktree.isDetached || !worktree.branch) return 'detached';
  return stripLocalBranchPrefix(worktree.branch);
}

export function worktreeFolderName(worktreePath: string): string {
  const normalized = worktreePath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return worktreePath;
  return normalized.split('/').pop() || normalized;
}

export function localBranchNameForDisplayRef(displayRef: DisplayRef): string | null {
  switch (displayRef.type) {
    case 'local-branch':
      return displayRef.localName;
    case 'merged-branch':
      return displayRef.localName;
    case 'remote-branch':
    case 'tag':
    case 'stash':
      return null;
  }
}

export function worktreeForDisplayRef(
  displayRef: DisplayRef,
  worktreeByBranch: Map<string, WorktreeInfo>,
): WorktreeInfo | undefined {
  const localBranch = localBranchNameForDisplayRef(displayRef);
  return localBranch ? worktreeByBranch.get(localBranch) : undefined;
}

export function prioritizeWorktreeDisplayRefs(
  displayRefs: DisplayRef[],
  worktreeByBranch: Map<string, WorktreeInfo>,
): DisplayRef[] {
  if (displayRefs.length === 0 || worktreeByBranch.size === 0) return displayRefs;

  const withWorktree: DisplayRef[] = [];
  const withoutWorktree: DisplayRef[] = [];

  for (const displayRef of displayRefs) {
    if (worktreeForDisplayRef(displayRef, worktreeByBranch)) {
      withWorktree.push(displayRef);
    } else {
      withoutWorktree.push(displayRef);
    }
  }

  return withWorktree.length > 0 ? [...withWorktree, ...withoutWorktree] : displayRefs;
}

export function detachedWorktreeBadgeText(worktrees: WorktreeInfo[]): string {
  if (worktrees.length === 1) {
    return `detached ${worktreeFolderName(worktrees[0].path)}`;
  }
  return `detached ×${worktrees.length}`;
}
