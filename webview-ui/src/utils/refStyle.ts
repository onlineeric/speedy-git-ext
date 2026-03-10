import type { DisplayRefType } from '../types/displayRefs';

export function getRefStyle(type: DisplayRefType): string {
  switch (type) {
    case 'local-branch':
      return 'bg-green-700/60 text-green-100';
    case 'remote-branch':
      return 'bg-blue-700/60 text-blue-100';
    case 'merged-branch':
      // Local background/text with remote border to signal dual local+remote state
      return 'bg-green-700/60 text-green-100 border border-blue-400';
    case 'tag':
      return 'bg-yellow-700/60 text-yellow-100';
    case 'stash':
      return 'bg-purple-700/60 text-purple-100';
  }
}
