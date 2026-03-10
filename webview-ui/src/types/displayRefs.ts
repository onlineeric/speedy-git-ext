/**
 * A display-ready ref label produced by mergeRefs().
 * Replaces the raw RefInfo[] for rendering purposes.
 *
 * Discriminated union — each variant carries only the fields it needs,
 * so callers never need non-null assertions.
 */
export type DisplayRef =
  | { type: 'local-branch'; localName: string }
  | { type: 'remote-branch'; remoteName: string }
  | { type: 'merged-branch'; localName: string; remoteNames: string[] } // FR-003
  | { type: 'tag'; tagName: string }
  | { type: 'stash'; stashRef: string };

/** Convenience alias derived from the union — stays in sync automatically. */
export type DisplayRefType = DisplayRef['type'];
