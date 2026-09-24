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
   * webview displays as HEAD is current (see `findHeadCommitHash`).
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
 * State after one `commitsAppended` batch of a Go to HEAD already in flight,
 * snapshotted from the store plus the pending navigation.
 */
export interface HeadContinuationContext {
  /** True once the target row is present in the displayed (merged) row list. */
  isDisplayed: boolean;
  /** True when the target is loaded but hidden by a client-side filter. */
  isHiddenClientSide: boolean;
  /** Whether more commits can still be paginated in. */
  hasMore: boolean;
  /** How many targeted batches this navigation has already requested. */
  attempts: number;
  /** HEAD's position as located when the navigation started. */
  targetIndex: number;
  /** Number of raw commits currently loaded in the store. */
  loadedCount: number;
}

export type HeadContinuationDecision =
  | { kind: 'scrollTo' }
  | { kind: 'loadMore'; targetIndex: number }
  | { kind: 'hiddenByFilter' }
  /** Ran out of history, or hit the attempt cap, without reaching HEAD. */
  | { kind: 'unreachable' };

/**
 * Decide the next step after a targeted batch lands: navigate once the target
 * row exists, otherwise keep requesting batches until it is found, filtered
 * out, exhausted or capped.
 *
 * Kept here beside `decideHeadNavigation` rather than in the RPC client so both
 * halves of one navigation state machine answer to the same rules — and so the
 * attempt cap is testable without a fake message channel.
 */
export function decideHeadContinuation(context: HeadContinuationContext): HeadContinuationDecision {
  if (context.isDisplayed) {
    return { kind: 'scrollTo' };
  }
  if (context.isHiddenClientSide) {
    return { kind: 'hiddenByFilter' };
  }
  if (!context.hasMore || context.attempts >= MAX_GO_TO_HEAD_LOADS) {
    return { kind: 'unreachable' };
  }
  // History may have grown since HEAD was located — never request less than one
  // batch past what is already loaded.
  return { kind: 'loadMore', targetIndex: Math.max(context.targetIndex, context.loadedCount) };
}

/**
 * Which commit a navigation is heading for. The same state machine drives the
 * toolbar "Go to HEAD" and the details panel's "Go to parent/child commit";
 * only the wording of the outcomes differs.
 */
export type CommitNavigationTarget = 'head' | 'parent' | 'child';

type NavigationMessageKind = 'hiddenByFilter' | 'notInView' | 'unresolved' | 'unreachable';

/** User-facing toast messages for the non-navigating outcomes. */
export const HEAD_NAVIGATION_MESSAGES = {
  hiddenByFilter: 'The HEAD commit is hidden by the current author or search filter.',
  notInView: 'The HEAD commit is not in the current view. Clear filters or refresh and try again.',
  unresolved: 'Could not resolve HEAD — the repository may not have any commits yet.',
  unreachable: 'Could not reach the HEAD commit. Refresh and try again.',
} as const;

function relatedCommitMessages(label: 'parent' | 'child'): Record<NavigationMessageKind, string> {
  return {
    hiddenByFilter: `The ${label} commit is hidden by the current author or search filter.`,
    notInView: `The ${label} commit is not in the current view. Clear filters or refresh and try again.`,
    // A parent/child navigation starts from a known hash, so this is a stale
    // view rather than an empty repository.
    unresolved: `Could not find the ${label} commit. Refresh and try again.`,
    unreachable: `Could not reach the ${label} commit. Refresh and try again.`,
  };
}

/** Toast messages per navigation target; `head` is {@link HEAD_NAVIGATION_MESSAGES}. */
export const COMMIT_NAVIGATION_MESSAGES: Record<CommitNavigationTarget, Record<NavigationMessageKind, string>> = {
  head: HEAD_NAVIGATION_MESSAGES,
  parent: relatedCommitMessages('parent'),
  child: relatedCommitMessages('child'),
};

/** Webview-side state for a parent/child navigation, before asking the backend. */
export interface LoadedCommitContext {
  /** The target's index in the displayed (merged) row list; -1 when not displayed. */
  mergedIndex: number;
  /** True when the target is loaded but hidden by a client-side author/search filter. */
  isHiddenClientSide: boolean;
}

export type LoadedCommitDecision =
  | { kind: 'scrollTo' }
  | { kind: 'hiddenByFilter' }
  /** Not loaded yet — ask the backend for its position (`locateHead` with a `targetHash`). */
  | { kind: 'locate' };

/**
 * First step of a navigation whose hash is already known (parent/child). A row
 * that is displayed or filtered out needs no backend round trip; only a commit
 * deeper than the loaded batches must be located first.
 */
export function decideLoadedCommitNavigation(context: LoadedCommitContext): LoadedCommitDecision {
  if (context.mergedIndex >= 0) return { kind: 'scrollTo' };
  if (context.isHiddenClientSide) return { kind: 'hiddenByFilter' };
  return { kind: 'locate' };
}

/**
 * Safety cap on how many follow-up `loadMoreCommits` requests one Go to HEAD
 * click may issue. A targeted request normally reaches HEAD in one or two
 * batches; the cap only guards against pathological churn (history rewritten
 * mid-navigation, endless filtered gaps).
 */
export const MAX_GO_TO_HEAD_LOADS = 12;
