import type { FileChange } from '@shared/types';

export type ActionKind = 'stage' | 'unstage' | 'discard' | 'stash';

export interface RadioAvailability {
  stageEnabled: boolean;
  unstageEnabled: boolean;
  discardEnabled: boolean;
  stashEnabled: boolean;
  stageCount: number;
  unstageCount: number;
  discardCount: number;
  stashCount: number;
}

export interface ComputeRadioAvailabilityArgs {
  selectedPaths: Set<string>;
  stagedFiles: FileChange[];
  unstagedFiles: FileChange[];
}

/**
 * Computes enable flags and affected-file counts for each of the four action
 * radio rows, given the selected paths and the staged/unstaged file lists.
 * Dual-state paths (appearing in both lists) contribute to both stage and
 * unstage counts per spec FR-015a.
 */
export function computeRadioAvailability(args: ComputeRadioAvailabilityArgs): RadioAvailability {
  const { selectedPaths, stagedFiles, unstagedFiles } = args;

  const stagedPathSet = new Set(stagedFiles.map((f) => f.path));
  const unstagedPathSet = new Set(unstagedFiles.map((f) => f.path));

  let stageCount = 0;
  let unstageCount = 0;

  for (const path of selectedPaths) {
    if (unstagedPathSet.has(path)) stageCount += 1;
    if (stagedPathSet.has(path)) unstageCount += 1;
  }

  const stashCount = selectedPaths.size;
  const discardCount = stageCount;

  const hasAnySelection = stashCount > 0;
  const stageEnabled = stageCount > 0;
  const unstageEnabled = unstageCount > 0;
  const discardEnabled = stageEnabled;
  const stashEnabled = hasAnySelection;

  return {
    stageEnabled,
    unstageEnabled,
    discardEnabled,
    stashEnabled,
    stageCount,
    unstageCount,
    discardCount,
    stashCount,
  };
}

/**
 * Returns the default-selected radio per spec FR-016/FR-017/FR-018.
 * Sticky: keep `previous` when it's still enabled, otherwise fall back to
 * Stage → Unstage → Stash.
 */
export function applyDefaultRadioRule(
  availability: RadioAvailability,
  previous: ActionKind | null,
): ActionKind | null {
  const anyEnabled =
    availability.stageEnabled ||
    availability.unstageEnabled ||
    availability.discardEnabled ||
    availability.stashEnabled;
  if (!anyEnabled) return null;

  if (previous && isEnabled(availability, previous)) {
    return previous;
  }

  if (availability.stageEnabled) return 'stage';
  if (availability.unstageEnabled) return 'unstage';
  if (availability.stashEnabled) return 'stash';
  return null;
}

function isEnabled(availability: RadioAvailability, kind: ActionKind): boolean {
  switch (kind) {
    case 'stage':
      return availability.stageEnabled;
    case 'unstage':
      return availability.unstageEnabled;
    case 'discard':
      return availability.discardEnabled;
    case 'stash':
      return availability.stashEnabled;
  }
}
