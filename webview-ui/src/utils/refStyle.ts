import type { DisplayRefType } from '../types/displayRefs';

/** Returns layout-only Tailwind classes for a ref badge (no color classes). */
export function getRefStyle(type: DisplayRefType): string {
  switch (type) {
    case 'local-branch':
    case 'remote-branch':
    case 'tag':
    case 'stash':
      return '';
    case 'merged-branch':
      // Border signals dual local+remote state; color applied via inline style
      return 'border';
  }
}
