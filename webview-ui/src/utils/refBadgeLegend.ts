import type { WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';

/**
 * What a legend row draws. `ref` samples go through the real `RefLabel`, so the
 * legend cannot drift from what the graph actually renders; `head` is the
 * standalone marker `CommitTableRow` puts before the badges.
 */
export type RefBadgeLegendSample =
  | { kind: 'ref'; displayRef: DisplayRef; worktree?: WorktreeInfo }
  | { kind: 'head' };

/**
 * Icons a description can show inline, so copy that points at a toolbar button
 * can show the glyph the user is meant to look for rather than only naming it.
 */
export type LegendInlineIcon = 'goToHead';

/** Where `inlineIcon` is substituted into a description. */
export const LEGEND_INLINE_ICON_PLACEHOLDER = '{icon}';

export interface RefBadgeLegendEntry {
  /** Stable key, also used by tests to name a row. */
  id: string;
  sample: RefBadgeLegendSample;
  /** Contains exactly one `LEGEND_INLINE_ICON_PLACEHOLDER` when `inlineIcon` is set, and none otherwise. */
  description: string;
  inlineIcon?: LegendInlineIcon;
}

/** A stand-in worktree for the sample badge; only `path` is user-visible (in the tooltip). */
const SAMPLE_WORKTREE: WorktreeInfo = {
  path: '~/repos/my-project.worktrees/feature-login',
  head: '0000000',
  branch: 'feature/login',
  isMain: false,
  isDetached: false,
  isCurrent: false,
  isPrunable: false,
};

/**
 * The graph's badge vocabulary, in the order it is explained.
 *
 * Branch states come first and in the order local → remote → both, because the
 * third is the union of the first two and only reads that way once they have
 * been seen. Everything after is a separate kind of ref rather than a variation
 * on the branch icons.
 *
 * Every `DisplayRef` type appears here — `refBadgeLegend.test.ts` enforces it, so
 * adding a ref kind without explaining it fails the build rather than silently
 * shipping an unexplained badge.
 */
export const REF_BADGE_LEGEND: RefBadgeLegendEntry[] = [
  {
    id: 'local-branch',
    sample: { kind: 'ref', displayRef: { type: 'local-branch', localName: 'main' } },
    description: 'A local branch. The fork means the branch exists in your clone; it has not been pushed to any remote.',
  },
  {
    id: 'remote-branch',
    sample: { kind: 'ref', displayRef: { type: 'remote-branch', remoteName: 'origin/main' } },
    description: 'A remote branch. The cloud means the branch exists on a remote, and you have no local branch of that name.',
  },
  {
    id: 'merged-branch',
    sample: { kind: 'ref', displayRef: { type: 'merged-branch', localName: 'main', remoteNames: ['origin/main'] } },
    description: 'Both at once — the two icons together. The same branch exists locally and on a remote.',
  },
  {
    id: 'merged-branch-multi',
    sample: {
      kind: 'ref',
      displayRef: { type: 'merged-branch', localName: 'release', remoteNames: ['origin/release', 'upstream/release'] },
    },
    description: 'A branch pushed to more than one remote. The number counts them; hover the badge to see their names.',
  },
  {
    id: 'worktree',
    sample: {
      kind: 'ref',
      displayRef: { type: 'merged-branch', localName: 'feature/login', remoteNames: ['origin/feature/login'] },
      worktree: SAMPLE_WORKTREE,
    },
    description: 'Checked out in a linked worktree. The badge is outlined to set it apart; hover it for the folder.',
  },
  {
    id: 'head',
    sample: { kind: 'head' },
    description:
      'HEAD — the commit you have checked out. It sits before the badges on that row. The HEAD button {icon} in the toolbar scrolls straight to it.',
    inlineIcon: 'goToHead',
  },
  {
    id: 'tag',
    sample: { kind: 'ref', displayRef: { type: 'tag', tagName: 'v5.10.0' } },
    description: 'A tag. Hover it for an annotated tag’s message, tagger and date.',
  },
  {
    id: 'stash',
    sample: { kind: 'ref', displayRef: { type: 'stash', stashRef: 'stash@{0}' } },
    description: 'A stash, drawn on the commit it was taken from. Stashes carry no icon.',
  },
];
