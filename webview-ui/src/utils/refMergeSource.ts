import type { RefInfo, RefType } from '@shared/types';
import type { MergeSourceKind } from '../components/MergeDialog';

/** What a ref badge offers `git merge`, or `null` when it offers nothing. */
export interface RefMergeSource {
  /** Wording for the merge dialog. */
  kind: MergeSourceKind;
  /** The commit-ish to hand `git merge`. */
  ref: string;
}

const MERGE_KIND_BY_REF_TYPE: Partial<Record<RefType, MergeSourceKind>> = {
  branch: 'branch',
  remote: 'remote-branch',
  tag: 'tag',
};

/**
 * Decide whether a ref badge can be merged, and under what name.
 *
 * `git merge` takes any commit-ish, so a tag and a remote-tracking branch are as
 * mergeable as a local one. The two badges that aren't are a stash, which is
 * applied rather than merged (FR-017 keeps it out of ref actions), and the branch
 * already checked out, which would merge itself.
 *
 * A remote branch has to be named `<remote>/<name>`: `refInfo.name` alone is the
 * *local* branch of that name, if one exists at all — so merging by the bare name
 * silently merges something else.
 */
export function getRefMergeSource(refInfo: RefInfo, isCurrentBranch: boolean): RefMergeSource | null {
  if (isCurrentBranch) return null;
  const kind = MERGE_KIND_BY_REF_TYPE[refInfo.type];
  if (!kind) return null;
  return { kind, ref: refInfo.remote ? `${refInfo.remote}/${refInfo.name}` : refInfo.name };
}
