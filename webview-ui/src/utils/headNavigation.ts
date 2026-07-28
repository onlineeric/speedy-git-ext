/**
 * Decision logic for the toolbar "Go to HEAD" navigation (pure, unit-tested).
 *
 * The backend answers a `locateHead` request with HEAD's hash and its 0-based
 * position in the filtered log stream. This module turns that answer — plus
 * the webview's current load/filter state — into one concrete next step for
 * the RPC client to execute.
 */

/** Everything the decision needs, snapshotted from the store + backend answer. */
export interface HeadLocationContext {
  /** HEAD commit hash from the backend; null when HEAD could not be resolved. */
  hash: string | null;
  /**
   * HEAD's 0-based position in the filtered log stream; -1 when absent, and
   * null when the backend skipped the position walk because the row the
   * webview displays as HEAD is current (see `findDisplayedHeadHash`).
   */
  index: number | null;
  /** Number of raw commits currently loaded in the store. */
  loadedCount: number;
  /** HEAD's index in the displayed (merged) row list; -1 when not displayed. */
  mergedIndex: number;
  /** True when HEAD is loaded but hidden by a client-side author/search filter. */
  isHiddenClientSide: boolean;
  /** Whether more commits can still be paginated in. */
  hasMore: boolean;
}

export type HeadNavigationDecision =
  /** HEAD row is on screen data — select, scroll, and flash it. */
  | { kind: 'scrollTo' }
  /** HEAD is deeper than what is loaded — request commits up to its position. */
  | { kind: 'loadMore'; targetIndex: number }
  /** HEAD is loaded but hidden by a client-side author/search filter. */
  | { kind: 'hiddenByFilter' }
  /** HEAD is not part of the filtered log stream (branch/date filters), or the view is stale. */
  | { kind: 'notInView' }
  /** HEAD could not be resolved at all (e.g. repository without commits). */
  | { kind: 'unresolved' };

export function decideHeadNavigation(context: HeadLocationContext): HeadNavigationDecision {
  if (!context.hash) {
    return { kind: 'unresolved' };
  }
  if (context.mergedIndex >= 0) {
    return { kind: 'scrollTo' };
  }
  if (context.isHiddenClientSide) {
    return { kind: 'hiddenByFilter' };
  }
  // No usable position: either HEAD is not in the filtered stream (-1), or the
  // position walk was skipped for a displayed row that has since gone (null,
  // raced with a refresh). Both leave a refresh as the way forward.
  if (context.index === null || context.index < 0) {
    return { kind: 'notInView' };
  }
  if (context.index >= context.loadedCount && context.hasMore) {
    return { kind: 'loadMore', targetIndex: context.index };
  }
  // Located within the loaded range yet absent from it (history changed since
  // the last load), or nothing more to load — a refresh is the way out.
  return { kind: 'notInView' };
}

/**
 * The commit the webview currently displays as HEAD, or null when HEAD is not
 * on screen (deeper than the loaded batches, or hidden by a filter).
 *
 * Sent with `locateHead` so the backend can confirm it with a single
 * `rev-parse` instead of walking the entire log for a position the webview
 * already holds.
 */
export function findDisplayedHeadHash(
  displayedCommits: readonly { hash: string; refs?: readonly { type: string }[] }[],
): string | null {
  return displayedCommits.find((commit) => commit.refs?.some((ref) => ref.type === 'head'))?.hash ?? null;
}

/** User-facing toast messages for the non-navigating outcomes. */
export const HEAD_NAVIGATION_MESSAGES = {
  hiddenByFilter: 'The HEAD commit is hidden by the current author or search filter.',
  notInView: 'The HEAD commit is not in the current view. Clear filters or refresh and try again.',
  unresolved: 'Could not resolve HEAD — the repository may not have any commits yet.',
  unreachable: 'Could not reach the HEAD commit. Refresh and try again.',
} as const;

/**
 * Safety cap on how many follow-up `loadMoreCommits` requests one Go to HEAD
 * click may issue. A targeted request normally reaches HEAD in one or two
 * batches; the cap only guards against pathological churn (history rewritten
 * mid-navigation, endless filtered gaps).
 */
export const MAX_GO_TO_HEAD_LOADS = 12;
