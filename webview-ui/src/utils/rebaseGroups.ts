import type { RebaseEntry } from '@shared/types';
import { groupRebaseEntries } from '@shared/rebaseTodo';

/**
 * Where a row sits in the bracket that joins a squash group in the interactive
 * rebase list.
 *
 * - `lead`   — a `pick`/`reword` that at least one `squash`/`fixup` merges into
 * - `member` — a row inside the bracket that is not its last row
 * - `last`   — the group's final `squash`/`fixup`
 * - `none`   — outside any group
 */
export type RebaseGroupPosition = 'lead' | 'member' | 'last' | 'none';

/**
 * Derived from the list itself, for every group — not only autosquash ones —
 * because that is git's rule: a `squash`/`fixup` always merges into the nearest
 * non-dropped row above it. Recomputing it from the current list keeps the
 * bracket right after manual drags and action changes. A `drop` between a lead
 * and a later member is skipped by git, so the bracket passes through it.
 */
export function getRebaseGroupPositions(entries: readonly RebaseEntry[]): RebaseGroupPosition[] {
  const positions: RebaseGroupPosition[] = entries.map(() => 'none');
  for (const { leadIndex, memberIndices } of groupRebaseEntries(entries)) {
    if (memberIndices.length === 0) continue;
    const lastIndex = memberIndices[memberIndices.length - 1];
    positions[leadIndex] = 'lead';
    for (let i = leadIndex + 1; i < lastIndex; i++) positions[i] = 'member';
    positions[lastIndex] = 'last';
  }
  return positions;
}
