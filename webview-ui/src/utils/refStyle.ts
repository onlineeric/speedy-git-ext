import type { DisplayRefType } from '../types/displayRefs';

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
