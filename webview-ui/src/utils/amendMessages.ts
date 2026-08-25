/**
 * Wording for the two halves of an amend that can come apart.
 *
 * The force push runs as a separate step after the amend has already succeeded,
 * so a rejected push must never read as a failed amend — "did my commit get
 * rewritten or not?" is the one question the user must never be left holding.
 */

/**
 * Git refuses a `--force-with-lease` push whose lease is out of date with
 * `stale info`, which is accurate and useless: it names the mechanism, not the
 * situation. The situation is that the remote moved since the last fetch, and
 * the action is to look at what changed before overwriting it.
 */
export function describeForcePushFailure(rawError: string): string {
  const trimmed = rawError.trim();
  const isLeaseRejection = /stale info/i.test(trimmed);
  const detail = isLeaseRejection
    ? 'The remote branch moved since your last fetch, so the force push was refused rather than overwriting work you have not seen yet. Fetch and check what changed before force pushing again.'
    : trimmed;
  return detail
    ? `The commit was amended locally, but the force push was rejected. ${detail}`
    : 'The commit was amended locally, but the force push was rejected.';
}

/**
 * Why a branch badge that is not the checked-out one shows amend disabled.
 *
 * Says where the amend *can* be run from, not just that it cannot be run here —
 * the item is disabled on this badge, but the operation is available on the same
 * row, so a refusal that stops at "no" would send the user looking for something
 * that is already in front of them.
 */
export function describeAmendBadgeBlock(
  badgeBranchName: string,
  currentBranchName: string | undefined
): string {
  if (currentBranchName === undefined) {
    return `No branch is checked out, so amending would move HEAD alone — not ${badgeBranchName}. Use the commit row to amend.`;
  }
  return `Amending rewrites the commit HEAD points at, so it would move ${currentBranchName}, not ${badgeBranchName}. Use ${currentBranchName}'s badge or the commit row.`;
}
