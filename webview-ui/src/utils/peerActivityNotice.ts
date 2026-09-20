/**
 * Whether to tell the user that *another* Speedy Git view is mid-operation on
 * this same working tree, and in what words.
 *
 * It is a notice and nothing more. No control is disabled by a peer's work: a
 * peer's operation can be long — a commit parked in a slow `pre-commit` hook —
 * and the only Cancel lives in the tab that started it, so gating on this would
 * strand every other view with no way out. Colliding operations are git's to
 * refuse; `index.lock` and the operation guard already report them clearly.
 *
 * The text names no repository and no branch, so it is safe wherever it lands.
 */
export const PEER_ACTIVITY_NOTICE = 'Another Speedy Git view is running a Git operation.';

export function peerActivityNotice(peerBusy: boolean, ownOperationInProgress: boolean): string | null {
  // This tab's own busy state already speaks for itself; saying both at once
  // would just be noise.
  if (!peerBusy || ownOperationInProgress) return null;
  return PEER_ACTIVITY_NOTICE;
}
