import type { Commit, SlotValue } from '@shared/types';

/**
 * Decide whether a slot value points at the given commit row, *without* waiting
 * for a compare to run (FR-026, Session 2026-05-09 clarification).
 *
 * Slot kinds with deterministic mapping return a match immediately:
 *  - `commit`  → exact hash match
 *  - `branch`  → row's refs include the same branch (matching local vs. remote
 *                per the slot's `remote` field)
 *  - `tag`     → row's refs include the same tag
 *  - `head`    → row's refs include the HEAD pointer
 *
 * `workingTree`, `expression`, and `emptyTree` never match here; for `expression`
 * the resolved-hash fallback in the consuming component covers the post-compare
 * case (FR-028).
 */
export function slotMatchesCommitRow(slot: SlotValue | null, commit: Commit): boolean {
  if (!slot) return false;
  switch (slot.kind) {
    case 'commit':
      return slot.hash === commit.hash;
    case 'branch':
      return commit.refs.some((r) => {
        if (r.name !== slot.name) return false;
        if (slot.remote) return r.type === 'remote' && r.remote === slot.remote;
        return r.type === 'branch';
      });
    case 'tag':
      return commit.refs.some((r) => r.type === 'tag' && r.name === slot.name);
    case 'head':
      return commit.refs.some((r) => r.type === 'head');
    case 'workingTree':
    case 'expression':
    case 'emptyTree':
      return false;
  }
}
