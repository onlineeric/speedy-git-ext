import type { Branch } from '@shared/types';

/**
 * Canonical identifier for a branch in the branch-filter selection
 * (`filters.branches`): the bare name for local branches, `remote/name`
 * for remote branches.
 */
export function getBranchKey(branch: Branch): string {
  return branch.remote ? `${branch.remote}/${branch.name}` : branch.name;
}

/**
 * Adds every local branch name to the current filter selection, preserving
 * whatever is already selected (local or remote). Purely additive, so
 * applying it repeatedly never deselects anything.
 *
 * Returns the new selection, or `null` when the selection is unchanged
 * (all local branches were already selected) so callers can skip a refetch.
 */
export function addAllLocalBranches(selected: string[], branches: Branch[]): string[] | null {
  const localNames = branches.filter((b) => !b.remote).map(getBranchKey);
  const next = [...new Set([...selected, ...localNames])];
  return next.length === selected.length ? null : next;
}
