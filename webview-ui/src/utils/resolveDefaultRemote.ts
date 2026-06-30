import type { Branch } from '@shared/types';

/**
 * Picks the default remote from a list of names: `origin` when present,
 * otherwise the alphabetically first. Falls back to literal `origin` when the
 * list is empty so command previews stay readable and git surfaces the
 * resulting error after confirm.
 */
function pickDefaultRemote(names: string[]): string {
  if (names.includes('origin')) return 'origin';
  if (names.length === 0) return 'origin';
  return [...names].sort()[0];
}

/**
 * Picks the remote name to use for branch-targeted operations like
 * fast-forward, inferred from the remote-tracking branches in the loaded list.
 */
export function resolveDefaultRemote(branches: Branch[]): string {
  const remoteNames = new Set<string>();
  for (const b of branches) {
    if (b.remote) remoteNames.add(b.remote);
  }
  return pickDefaultRemote([...remoteNames]);
}

/**
 * Picks the default remote NAME from the configured remotes list. Reads the
 * actual remote configs rather than inferring from remote-tracking branches — so
 * it stays correct for a remote that has no loaded tracking branches (e.g. not
 * yet fetched). Used by tag push/delete affordances.
 */
export function resolveDefaultRemoteName(remotes: { name: string }[]): string {
  return pickDefaultRemote(remotes.map((r) => r.name));
}
