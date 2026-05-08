import type { Branch } from '@shared/types';

/**
 * Picks the remote name to use for branch-targeted operations like
 * fast-forward. Prefers `origin` when present; otherwise the alphabetically
 * first remote in the loaded branch list. Falls back to literal `origin` when
 * no remotes are loaded so command previews stay readable and git surfaces
 * the resulting error after confirm.
 */
export function resolveDefaultRemote(branches: Branch[]): string {
  const remoteNames = new Set<string>();
  for (const b of branches) {
    if (b.remote) remoteNames.add(b.remote);
  }
  if (remoteNames.has('origin')) return 'origin';
  if (remoteNames.size === 0) return 'origin';
  return [...remoteNames].sort()[0];
}
