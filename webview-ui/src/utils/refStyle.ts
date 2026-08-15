import type { DisplayRefType } from '../types/displayRefs';

/**
 * Shape, padding and text size shared by every ref badge; the border comes from
 * `getRefStyle` and the colors from the lane style.
 *
 * Exported so a badge rendered outside the graph — an icon-only sample in the
 * release notes, say — is built from the same chrome rather than an eyeballed
 * copy that slowly stops matching.
 */
export const REF_BADGE_BASE_CLASS = 'inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded';

/** Returns layout-only Tailwind classes for a ref badge (no color classes). */
export function getRefStyle(type: DisplayRefType): string {
  switch (type) {
    case 'local-branch':
    case 'remote-branch':
    case 'tag':
    case 'stash':
    case 'merged-branch':
      return 'border';
  }
}
