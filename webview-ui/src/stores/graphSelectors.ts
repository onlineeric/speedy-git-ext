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

/**
 * Whether a git operation is occupying the repository.
 *
 * Items that depend on this are *disabled*, never hidden — an option that
 * vanishes during the brief refresh a filter change triggers reads as a bug.
 */
export function useOperationInProgress(): boolean {
  return useGraphStore(
    (s) =>
      s.loading ||
      s.rebaseInProgress ||
      s.cherryPickInProgress ||
      s.revertInProgress ||
      s.mergeInProgress
  );
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
