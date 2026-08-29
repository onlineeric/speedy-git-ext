import type { WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';

const LOCAL_BRANCH_PREFIX = 'refs/heads/';

export function stripLocalBranchPrefix(branch: string): string {
  return branch.startsWith(LOCAL_BRANCH_PREFIX) ? branch.slice(LOCAL_BRANCH_PREFIX.length) : branch;
}

/** Tooltip shown on actions disabled because a worktree's folder is missing (prunable). */
export const WORKTREE_FOLDER_MISSING_TOOLTIP = 'This worktree folder is missing.';

/** The worktree's local branch name (prefix stripped), or null when detached / unborn. */
export function worktreeLocalBranch(worktree: WorktreeInfo): string | null {
  if (worktree.isDetached || !worktree.branch) return null;
  return stripLocalBranchPrefix(worktree.branch);
}

export function worktreeBranchLabel(worktree: WorktreeInfo): string {
  return worktreeLocalBranch(worktree) ?? 'detached';
}

/** Normalize to `/` separators and drop any trailing separator, for display. */
function toDisplayPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** True for a drive-letter-rooted path (`C:/…`), the only case-insensitive shape here. */
function isWindowsPath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value);
}

/**
 * The label for a worktree folder.
 *
 * A worktree inside the configured base dir is labelled by its path *below* that
 * base dir, because nesting makes the last segment ambiguous — `exp/branch1` and
 * `feat/branch1` would otherwise both read as `branch1`. One outside the base dir
 * keeps its last segment: there is no meaningful path to show it relative to.
 */
export function worktreeFolderName(worktreePath: string, baseDir?: string | null): string {
  const normalized = toDisplayPath(worktreePath);
  if (!normalized) return worktreePath;

  if (baseDir) {
    const base = toDisplayPath(baseDir);
    // Windows paths compare case-insensitively: git reports a worktree path as it was
    // recorded, the base dir is resolved separately, and the two routinely disagree on
    // drive-letter or folder casing. Comparing them literally would silently drop every
    // nested label back to its ambiguous last segment.
    const prefixMatches = isWindowsPath(base)
      ? normalized.toLowerCase().startsWith(base.toLowerCase() + '/')
      : normalized.startsWith(base + '/');
    if (base && normalized.length > base.length + 1 && prefixMatches) {
      return normalized.slice(base.length + 1);
    }
  }

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

/** Sort priority for badge ordering: checked-out branch first, then worktree branches, then everything else. */
function worktreeDisplayPriority(
  displayRef: DisplayRef,
  worktreeByBranch: Map<string, WorktreeInfo>,
  headBranchName: string | null,
): number {
  const localBranch = localBranchNameForDisplayRef(displayRef);
  if (localBranch === null) return 2;
  if (localBranch === headBranchName) return 0;
  return worktreeByBranch.has(localBranch) ? 1 : 2;
}

/**
 * Orders badges so the checked-out branch (`headBranchName`) sorts first, branches
 * that live in a linked worktree sort next, and everything else keeps its relative order.
 */
export function prioritizeWorktreeDisplayRefs(
  displayRefs: DisplayRef[],
  worktreeByBranch: Map<string, WorktreeInfo>,
  headBranchName: string | null = null,
): DisplayRef[] {
  if (displayRefs.length === 0) return displayRefs;
  if (worktreeByBranch.size === 0 && headBranchName === null) return displayRefs;

  return displayRefs
    .map((displayRef) => ({
      displayRef,
      priority: worktreeDisplayPriority(displayRef, worktreeByBranch, headBranchName),
    }))
    .sort((a, b) => a.priority - b.priority)
    .map(({ displayRef }) => displayRef);
}

export function detachedWorktreeBadgeText(worktrees: WorktreeInfo[], baseDir?: string | null): string {
  if (worktrees.length === 1) {
    return `detached ${worktreeFolderName(worktrees[0].path, baseDir)}`;
  }
  return `detached ×${worktrees.length}`;
}
