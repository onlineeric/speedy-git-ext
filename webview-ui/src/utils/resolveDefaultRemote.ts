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


/** Resolve an existing same-named remote branch without guessing a push destination. */
export function resolvePublishedBranchRemote(branches: readonly Branch[], local: Branch | null): string | undefined {
  if (!local || local.remote) return undefined;
  const counterparts = branches.filter((branch) => branch.remote && branch.name === local.name);
  const upstream = counterparts.find((branch) => `${branch.remote}/${branch.name}` === local.upstream);
  if (upstream) return upstream.remote;
  // A configured upstream pointing elsewhere is also a reason to ask the user
  // to choose explicitly, even when only one same-named counterpart exists.
  if (local.upstream) return undefined;
  const remotes = [...new Set(counterparts.map((branch) => branch.remote!))];
  return remotes.length === 1 ? remotes[0] : undefined;
}
