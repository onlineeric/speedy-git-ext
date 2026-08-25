import type { Branch, Commit } from '@shared/types';
import { isHeadRow, isStashPseudoCommit } from './commitRefs';

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
  canMerge: boolean;
  /** `git commit --amend` rewrites the checked-out tip, so only that row offers it. */
  canAmend: boolean;
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
  // Deliberately NOT `isHeadCommit`: that one is "the current branch points
  // here", derived from `currentBranchHash`, and it is null in detached HEAD.
  // This one is "git has this commit checked out", read from the head ref, which
  // is exactly the case the two disagree on — and git amends in detached HEAD
  // perfectly well, so keying amend off the branch would make it vanish there.
  const isCheckedOutTip = isHeadRow(commit);

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
    // `git merge <commit>` is as valid as `git merge <branch>`, so the only cases
    // ruled out are the ones where it could not mean anything: a stash entry is a
    // pseudo-commit rather than a ref you can merge, and merging the commit the
    // current branch already sits on is git's own no-op. Anything else — including
    // an ancestor, which git answers with "Already up to date" — is left to git to
    // answer rather than pre-judged here.
    canMerge: !isStash && !isHeadCommit,
    // Merge commits (parents are preserved) and root commits are fine; a stash
    // entry is a pseudo-commit and cannot be amended.
    canAmend: isCheckedOutTip && !isStash,
  };
}

/**
 * Whether a local branch has a remote-tracking counterpart.
 *
 * Deliberately not the same question as "is this commit published", which
 * `isCommitPushed` answers by asking whether *any* remote branch contains the
 * commit. The two come apart whenever an unpublished branch shares a tip with a
 * published one — and there the commit is on a remote while the branch is not,
 * so a "force push after this" affordance would be offering to publish a branch
 * for the first time under the name of a force push.
 */
export function hasRemoteCounterpart(
  branches: readonly Branch[],
  localBranchName: string | undefined
): boolean {
  if (localBranchName === undefined) return false;
  return branches.some((branch) => !!branch.remote && branch.name === localBranchName);
}
