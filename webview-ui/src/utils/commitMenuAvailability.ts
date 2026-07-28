import type { Commit } from '@shared/types';
import { isStashPseudoCommit } from './commitRefs';

/**
 * Which commit operations apply to a given commit.
 *
 * The same set drives the commit row menu and the "Commit actions" submenu on
 * ref badges, so the rules live here instead of inside either menu component.
 */
export interface CommitMenuAvailability {
  /** The commit the current branch already points at. */
  isHeadCommit: boolean;
  isMergeCommit: boolean;
  isRootCommit: boolean;
  /** Stash entries are rendered as pseudo-commits but are not rewritable. */
  isStash: boolean;
  canCherryPick: boolean;
  canRebase: boolean;
  canRevert: boolean;
  canDrop: boolean;
  canReset: boolean;
}

export interface CommitMenuContext {
  commit: Commit;
  /** Hash the checked-out local branch points at, or null when there is none. */
  currentBranchHash: string | null;
  /**
   * Whether the current branch's history is linear from its tip down to this
   * commit — the commit is on the first-parent chain and no merge sits between.
   * Anything less means the stretch cannot be rewritten commit-by-commit.
   */
  isOnFirstParentChain: boolean;
}

export function getCommitMenuAvailability({
  commit,
  currentBranchHash,
  isOnFirstParentChain,
}: CommitMenuContext): CommitMenuAvailability {
  const isStash = isStashPseudoCommit(commit);
  const isMergeCommit = commit.parents.length > 1;
  const isRootCommit = commit.parents.length === 0;
  const isHeadCommit = currentBranchHash !== null && commit.hash === currentBranchHash;

  // Rebasing onto, and resetting to, both mean "move the current branch here",
  // so they become available under exactly the same condition: a branch exists
  // to move, and it isn't already here.
  const targetsOtherCommit = currentBranchHash !== null && !isHeadCommit;

  return {
    isHeadCommit,
    isMergeCommit,
    isRootCommit,
    isStash,
    canCherryPick: !isHeadCommit,
    canRebase: targetsOtherCommit,
    canReset: targetsOtherCommit,
    canRevert: !isRootCommit && !isStash,
    // Dropping replays every commit above this one onto its parent, so it needs
    // an unbroken linear stretch from the branch tip down to here. Merge commits
    // are excluded on both counts: dropping one is ambiguous rather than a
    // rewrite, and one sitting in between would be flattened by the replay.
    canDrop: !isRootCommit && !isMergeCommit && !isStash && isOnFirstParentChain,
  };
}
