/**
 * A display-ready ref label produced by mergeRefs().
 * Replaces the raw RefInfo[] for rendering purposes.
 */
export type DisplayRefType =
  | 'local-branch'   // Local branch with no matching remote
  | 'remote-branch'  // Remote branch with no matching local
  | 'merged-branch'  // Local + one or more matching remotes (FR-003)
  | 'tag'            // Git tag
  | 'stash';         // Stash entry

export interface DisplayRef {
  type: DisplayRefType;

  // local-branch, merged-branch
  localName?: string;

  // remote-branch: full qualified name, e.g. "origin/main"
  remoteName?: string;

  // merged-branch: list of full qualified remote names, e.g. ["origin/main", "upstream/main"]
  remoteNames?: string[];

  // tag
  tagName?: string;

  // stash
  stashRef?: string;
}
