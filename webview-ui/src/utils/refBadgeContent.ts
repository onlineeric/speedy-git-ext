import type { TagMetadata, WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';
import { formatDate } from './formatDate';

/** A glyph that can precede a ref badge's label. */
export type RefBadgeIcon = 'branch' | 'cloud' | 'tag';

export interface RefBadgeContent {
  /** Visible badge text. */
  label: string;
  /** Glyphs preceding the label, in render order. Empty for refs that carry none (stashes). */
  leadIcons: RefBadgeIcon[];
  /**
   * How many remotes a *local* branch is synced to, driving the count next to
   * the cloud. 0 for every badge that isn't a merged branch.
   */
  remoteCount: number;
}

/**
 * Decides what a ref badge shows.
 *
 * The two branch icons are a system, not decoration: the fork glyph means
 * "exists locally" and the cloud means "exists on a remote". A branch that is
 * both therefore leads with the union of the two sets — which is what lets a
 * user work out the scheme from the badges alone, without hovering:
 *
 * - local-only    `⑂ main`
 * - remote-only   `☁ origin/main`
 * - local+remote  `⑂☁ main`
 *
 * Both glyphs lead so they sit on the same side of the name in every badge, and
 * so the *trailing* slot stays reserved for the worktree icon — an unrelated
 * annotation that would otherwise queue up behind the cloud (`⑂☁ main ⧉`).
 *
 * The remote *names* stay in the tooltip, since the common single-remote case
 * gains nothing from spending row width to repeat `origin`. Two or more remotes
 * can't be guessed that way, so those get a count on the cloud (`⑂☁2 main`) —
 * a badge only spends space on what the user can't otherwise infer.
 */
export function getRefBadgeContent(displayRef: DisplayRef): RefBadgeContent {
  switch (displayRef.type) {
    case 'local-branch':
      return { label: displayRef.localName, leadIcons: ['branch'], remoteCount: 0 };
    case 'remote-branch':
      return { label: displayRef.remoteName, leadIcons: ['cloud'], remoteCount: 0 };
    case 'merged-branch':
      return { label: displayRef.localName, leadIcons: ['branch', 'cloud'], remoteCount: displayRef.remoteNames.length };
    case 'tag':
      return { label: displayRef.tagName, leadIcons: ['tag'], remoteCount: 0 };
    case 'stash':
      return { label: displayRef.stashRef, leadIcons: [], remoteCount: 0 };
  }
}

/**
 * Builds the badge's native tooltip. For a merged branch this is the only place
 * the remote names remain visible, so it always lists them in full.
 */
export function getRefTitle(displayRef: DisplayRef, worktree?: WorktreeInfo, tagMeta?: TagMetadata): string {
  let title: string;
  switch (displayRef.type) {
    case 'local-branch':
      title = displayRef.localName;
      break;
    case 'remote-branch':
      title = displayRef.remoteName;
      break;
    case 'merged-branch':
      title = `${displayRef.localName} ⇄ ${displayRef.remoteNames.join(', ')}`;
      break;
    case 'tag':
      title = getTagTitle(displayRef.tagName, tagMeta);
      break;
    case 'stash':
      title = displayRef.stashRef;
      break;
  }

  return worktree ? `${title}\nWorktree: ${worktree.path}` : title;
}

/**
 * Build the tag badge tooltip: annotated tags show their message, tagger, and
 * date; lightweight tags are labelled as such; with no metadata yet (still
 * loading) we show just the name (048-tag-enhancements).
 */
function getTagTitle(tagName: string, tagMeta?: TagMetadata): string {
  if (!tagMeta) return tagName;
  if (!tagMeta.annotated) return `${tagName}\nLightweight tag`;

  const lines = [tagName];
  if (tagMeta.message) lines.push(tagMeta.message);
  if (tagMeta.tagger) lines.push(`Tagger: ${tagMeta.tagger}`);
  if (tagMeta.date !== undefined) lines.push(`Date: ${formatDate(tagMeta.date * 1000)}`);
  return lines.join('\n');
}

/**
 * Screen-reader text standing in for the cloud glyph, which is `aria-hidden`.
 * Without it the sync state would be visible but unannounced, since it no longer
 * appears in the badge's own text.
 */
export function remoteCountLabel(remoteCount: number): string {
  return remoteCount === 1 ? 'synced to 1 remote' : `synced to ${remoteCount} remotes`;
}
