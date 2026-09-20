/**
 * Derived reads of the graph store that more than one component needs.
 *
 * Each is a single selector returning a primitive or an existing store object,
 * so a subscriber re-renders only when its own answer changes — and, more
 * importantly, every caller derives the answer the same way. These used to be
 * spelled out per component, which let the commit menu and the branch menu
 * disagree about something as basic as "is an operation running right now".
 */
import type { CSSProperties } from 'react';
import type { Branch } from '@shared/types';
import { getColor, getLaneColorStyle, resolvePalette } from '../utils/colorUtils';
import { useGraphStore } from './graphStore';

/** The fields that say whether THIS tab is running something. */
export interface OwnOperationState {
  loading: boolean;
  isLoadingRepo: boolean;
  activeBranchCheckout: unknown;
  rebaseInProgress: boolean;
  cherryPickInProgress: boolean;
  revertInProgress: boolean;
  mergeInProgress: boolean;
}

/**
 * Whether a git operation is occupying the repository **in this tab**.
 *
 * `peerOperationInProgress` is deliberately absent. Another view's operation
 * drives a notice, never a disabled control: a peer's operation can be long — a
 * commit parked in a slow `pre-commit` hook — and the only Cancel lives in the
 * tab that started it, so folding the two together would strand every other
 * view with no way out.
 */
export function isOwnOperationInProgress(state: OwnOperationState): boolean {
  return (
    state.loading ||
    state.isLoadingRepo ||
    state.activeBranchCheckout !== null ||
    state.rebaseInProgress ||
    state.cherryPickInProgress ||
    state.revertInProgress ||
    state.mergeInProgress
  );
}

/**
 * Whether a git operation is occupying the repository.
 *
 * Items that depend on this are *disabled*, never hidden — an option that
 * vanishes during the brief refresh a filter change triggers reads as a bug.
 */
export function useOperationInProgress(): boolean {
  return useGraphStore(isOwnOperationInProgress);
}

/**
 * The checked-out local branch, or null in detached HEAD.
 *
 * Remote-tracking entries are excluded: only a local branch can be the one git
 * moves when you reset, rebase onto, or commit.
 */
export function useCurrentLocalBranch(): Branch | null {
  return useGraphStore((s) => s.branches.find((b) => b.current && !b.remote) ?? null);
}

/**
 * The graph's first lane color, and the badge style built from it.
 *
 * For badges shown *outside* the graph — the legend, release notes — where a
 * sample should look like something the user has already seen on screen. Read
 * from the palette setting rather than hardcoded, since `speedyGit.graphColors`
 * is the user's to change; lane 0 is simply the first column's color.
 */
export function useFirstLaneBadgeStyle(): { laneColor: string; laneColorStyle: CSSProperties } {
  const graphColors = useGraphStore((s) => s.userSettings.graphColors);
  const laneColor = getColor(0, resolvePalette(graphColors));
  return { laneColor, laneColorStyle: getLaneColorStyle(laneColor) };
}
