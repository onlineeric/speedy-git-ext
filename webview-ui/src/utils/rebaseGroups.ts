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

/**
 * A run of rows that is dragged as one unit: a squash group's whole bracket
 * (lead through its last member, including any `drop` it passes through), or
 * a single row outside any group. `id` is the first row's hash.
 */
export interface RebaseDragBlock {
  id: string;
  startIndex: number;
  entries: RebaseEntry[];
}

/**
 * Splits the list into drag blocks. Dragging a lead or a member alone would
 * silently change which commit the member merges into, so a group only ever
 * moves whole; to take a row out of a group, change its action first.
 */
export function getRebaseDragBlocks(entries: readonly RebaseEntry[]): RebaseDragBlock[] {
  const groupEndByLead = new Map<number, number>();
  for (const { leadIndex, memberIndices } of groupRebaseEntries(entries)) {
    if (memberIndices.length > 0) groupEndByLead.set(leadIndex, memberIndices[memberIndices.length - 1]);
  }

  const blocks: RebaseDragBlock[] = [];
  let index = 0;
  while (index < entries.length) {
    const endIndex = groupEndByLead.get(index) ?? index;
    blocks.push({ id: entries[index].hash, startIndex: index, entries: entries.slice(index, endIndex + 1) });
    index = endIndex + 1;
  }
  return blocks;
}

/** Moves the block `activeId` to where block `overId` sits, keeping every block intact. */
export function moveRebaseDragBlock(
  entries: RebaseEntry[],
  activeId: string,
  overId: string,
): RebaseEntry[] {
  const blocks = getRebaseDragBlocks(entries);
  const fromIndex = blocks.findIndex((block) => block.id === activeId);
  const toIndex = blocks.findIndex((block) => block.id === overId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return entries;

  const reordered = [...blocks];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered.flatMap((block) => block.entries);
}
