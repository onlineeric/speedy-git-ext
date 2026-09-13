import { fixupKindUsesEditorMessage, type FixupCommitKind } from '@shared/fixupCommit';

/**
 * The Create Fixup Commit dialog's decisions, kept out of the component.
 *
 * Every rule here is git's: only fixup and squash need something to commit;
 * amend and reword need git 2.32+; reword ignores the index. Counts come from
 * the store and may be stale, so the backend command stays the real check.
 */

export const FIXUP_KINDS: readonly FixupCommitKind[] = ['fixup', 'squash', 'amend', 'reword'];

export interface WorkingTreeCounts {
  stagedCount: number;
  /** Modified tracked files not staged. Untracked files are never included, not even by `-a`. */
  unstagedCount: number;
}

export type FixupKindBlock = 'nothingToCommit' | 'gitTooOld';

/** Why each kind cannot be chosen right now, or null when it can. */
export type FixupKindAvailability = Record<FixupCommitKind, FixupKindBlock | null>;

export function includedFileCount(counts: WorkingTreeCounts, includeAllTracked: boolean): number {
  return includeAllTracked ? counts.stagedCount + counts.unstagedCount : counts.stagedCount;
}

export function getFixupKindAvailability(options: {
  counts: WorkingTreeCounts;
  includeAllTracked: boolean;
  supportsAmendReword: boolean;
}): FixupKindAvailability {
  const nothingToCommit = includedFileCount(options.counts, options.includeAllTracked) === 0;
  const gitGate: FixupKindBlock | null = options.supportsAmendReword ? null : 'gitTooOld';
  return {
    fixup: nothingToCommit ? 'nothingToCommit' : null,
    squash: nothingToCommit ? 'nothingToCommit' : null,
    amend: gitGate,
    reword: gitGate,
  };
}

/**
 * Where the dialog opens: with nothing staged or modified, Reword — the only
 * kind git would accept — or nothing at all if this git is too old for it.
 * With only unstaged changes, `-a` is preselected so Fixup does not open
 * disabled.
 */
export function getInitialFixupSelection(options: {
  counts: WorkingTreeCounts;
  supportsAmendReword: boolean;
}): { kind: FixupCommitKind | null; includeAllTracked: boolean } {
  const { stagedCount, unstagedCount } = options.counts;
  if (stagedCount + unstagedCount === 0) {
    return { kind: options.supportsAmendReword ? 'reword' : null, includeAllTracked: false };
  }
  return { kind: 'fixup', includeAllTracked: stagedCount === 0 };
}

/**
 * The selection as it can be shown: a version-gated kind is dropped once the
 * version turns out too old, rather than staying checked on a disabled radio.
 * A kind blocked only by the include option stays selected, with its note.
 */
export function effectiveFixupKind(
  kind: FixupCommitKind | null,
  availability: FixupKindAvailability,
): FixupCommitKind | null {
  return kind !== null && availability[kind] === 'gitTooOld' ? null : kind;
}

export function canConfirmFixup(options: {
  kind: FixupCommitKind | null;
  availability: FixupKindAvailability;
  /** The amend/reword replacement message; null while it is still loading. */
  replacementMessage: string | null;
}): boolean {
  const { kind, availability, replacementMessage } = options;
  if (kind === null || availability[kind] !== null) return false;
  // An empty message aborts the commit in git, so it cannot be confirmed here.
  if (fixupKindUsesEditorMessage(kind)) return (replacementMessage ?? '').trim().length > 0;
  return true;
}

/** The squash `-m` text to send: only when the box is on and there is something to say. */
export function squashMessageToSend(addMessage: boolean, text: string): string | undefined {
  return addMessage && text.trim().length > 0 ? text : undefined;
}
