/**
 * Stale-dialog protection for the five actions git will *not* refuse on its
 * own: reset, rebase onto, force-push, delete branch and drop commit.
 * `reset --hard`, `push --force` and `branch -D` all succeed cheerfully against
 * a ref that moved under an open dialog, so the check has to be ours.
 *
 * The answer is **refuse only**. There is no re-run-anyway path: a payload
 * built from the commits the user saw — an interactive rebase plan above all —
 * must never be replayed against a different tip. The tab has already
 * auto-refreshed, so reopening the dialog *is* the renewed confirmation.
 *
 * This is the same shape `GitCommitService.amendCommit` already ships for
 * `HEAD_MOVED`; the wording is deliberately its sibling rather than a second
 * dialect.
 */
export interface RefExpectation {
  /** What to re-resolve: a branch name, a remote-tracking ref, or `'HEAD'`. */
  ref: string;
  /** The full hash the dialog displayed when the user opened it. */
  expectedHash: string;
}

/**
 * Full-hash equality — the dialog always has the full hash. A ref that can no
 * longer be resolved (`actual === null`) counts as moved.
 */
export function isRefMoved(expected: RefExpectation, actual: string | null): boolean {
  if (actual === null) return true;
  return actual !== expected.expectedHash;
}

/**
 * The whole user-facing sentence, in one place, so the five actions cannot word
 * it five ways.
 */
export function describeRefMoved(ref: string, actual: string | null): string {
  if (actual === null) {
    return `\`${ref}\` no longer exists. Nothing was done.`;
  }
  return `\`${ref}\` changed since you opened this dialog. Nothing was done — reopen the dialog to act on the current state.`;
}
