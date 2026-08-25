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
  const lead = 'The commit was amended locally, but the force push was rejected.';
  return detail ? `${lead} ${detail}` : lead;
}
