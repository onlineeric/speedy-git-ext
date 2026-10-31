import type { MultiDiffFile, MultiDiffSource } from '../../shared/types.js';

/**
 * Where one side of a diff reads its content from. The editor turns each kind
 * into a URI; keeping that out of here leaves the plan testable without vscode.
 */
export type DiffRevision =
  | { kind: 'commit'; hash: string }
  | { kind: 'index' }
  | { kind: 'workingTree' };

export interface MultiDiffRevisions {
  /** Absent when there is nothing before: a root commit, or an unborn branch. */
  before?: DiffRevision;
  after: DiffRevision;
}

export interface DiffSide {
  revision: DiffRevision;
  filePath: string;
  isSubmodule: boolean;
}

/** One file of the multi-file diff. A missing side renders as added / deleted. */
export interface MultiDiffEntry {
  filePath: string;
  original?: DiffSide;
  modified?: DiffSide;
}

/**
 * The two sides of an "Open Changes" list — the same pair a click on any one of
 * its files opens, so the multi-file view never disagrees with the single one.
 * `headHash` is empty on an unborn branch, which leaves no `before`.
 */
export function resolveMultiDiffRevisions(source: MultiDiffSource, headHash: string): MultiDiffRevisions {
  const head: DiffRevision | undefined = headHash ? { kind: 'commit', hash: headHash } : undefined;
  switch (source.kind) {
    case 'commit':
      return {
        before: source.parentHash ? { kind: 'commit', hash: source.parentHash } : undefined,
        after: { kind: 'commit', hash: source.hash },
      };
    case 'staged':
      return { before: head, after: { kind: 'index' } };
    case 'unstaged':
      return { before: head, after: { kind: 'workingTree' } };
    case 'compare':
      return { before: compareSlotRevision(source.aHash), after: compareSlotRevision(source.bHash) };
  }
}

/** Whether the source needs HEAD resolved before it can be planned. */
export function multiDiffNeedsHead(source: MultiDiffSource): boolean {
  return source.kind === 'staged' || source.kind === 'unstaged';
}

/**
 * Each file's two sides. A file left with neither side — a deletion with
 * nothing before it — has no diff to show and is dropped rather than handed to
 * the editor as an empty entry.
 */
export function planMultiDiffEntries(revisions: MultiDiffRevisions, files: MultiDiffFile[]): MultiDiffEntry[] {
  return files.flatMap((file) => {
    const isSubmodule = file.isSubmodule === true;
    const isNew = file.status === 'added' || file.status === 'untracked';
    const original = !isNew && revisions.before
      ? { revision: revisions.before, filePath: file.oldPath ?? file.path, isSubmodule }
      : undefined;
    const modified = file.status === 'deleted'
      ? undefined
      : { revision: revisions.after, filePath: file.path, isSubmodule };
    return original || modified ? [{ filePath: file.path, original, modified }] : [];
  });
}

/** A compare slot's side: `null` is the working-tree slot, as in `CompareResult`. */
export function compareSlotRevision(hash: string | null): DiffRevision {
  return hash === null ? { kind: 'workingTree' } : { kind: 'commit', hash };
}
