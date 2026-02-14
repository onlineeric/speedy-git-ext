export function getRefStyle(type: string): string {
  switch (type) {
    case 'head':
      return 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]';
    case 'branch':
      return 'bg-green-700/60 text-green-100';
    case 'remote':
      return 'bg-blue-700/60 text-blue-100';
    case 'tag':
      return 'bg-yellow-700/60 text-yellow-100';
    case 'stash':
      return 'bg-purple-700/60 text-purple-100';
    default:
      return 'bg-gray-700/60 text-gray-100';
  }
}
