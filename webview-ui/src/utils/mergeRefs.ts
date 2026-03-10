import type { RefInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';

export interface MergeRefsResult {
  isHead: boolean;
  displayRefs: DisplayRef[];
}

/**
 * Transforms raw RefInfo[] from a commit into display-ready DisplayRef[].
 *
 * Merges local and remote branches that share a name (name-convention match)
 * into a single 'merged-branch' badge. Detects HEAD status from the refs array.
 *
 * Algorithm:
 * 1. isHead = refs.some(r => r.type === 'head')
 * 2. Collect local branches and remote refs separately
 * 3. For each local branch, find matching remotes by name
 * 4. Emit merged-branch if remotes found, else local-branch
 * 5. Emit remaining (unmatched) remote-branch entries
 * 6. Emit tag entries
 * 7. Emit stash entries
 */
export function mergeRefs(refs: RefInfo[]): MergeRefsResult {
  const isHead = refs.some((r) => r.type === 'head');
  // Include 'head' refs that point to a named branch (HEAD -> branchName) so they
  // participate in remote-matching. Detached HEAD has name === 'HEAD' and is excluded.
  const localBranches = refs.filter((r) => r.type === 'branch' || (r.type === 'head' && r.name !== 'HEAD'));
  const remoteRefs = refs.filter((r) => r.type === 'remote');
  const tags = refs.filter((r) => r.type === 'tag');
  const stashes = refs.filter((r) => r.type === 'stash');

  const consumedRemotes = new Set<RefInfo>();
  const displayRefs: DisplayRef[] = [];

  for (const local of localBranches) {
    const matchingRemotes = remoteRefs.filter((r) => r.name === local.name);
    if (matchingRemotes.length > 0) {
      displayRefs.push({
        type: 'merged-branch',
        localName: local.name,
        remoteNames: matchingRemotes.map((r) => `${r.remote}/${r.name}`),
      });
      for (const r of matchingRemotes) {
        consumedRemotes.add(r);
      }
    } else {
      displayRefs.push({
        type: 'local-branch',
        localName: local.name,
      });
    }
  }

  for (const remote of remoteRefs) {
    if (!consumedRemotes.has(remote)) {
      displayRefs.push({
        type: 'remote-branch',
        remoteName: `${remote.remote}/${remote.name}`,
      });
    }
  }

  for (const tag of tags) {
    displayRefs.push({ type: 'tag', tagName: tag.name });
  }

  for (const stash of stashes) {
    displayRefs.push({ type: 'stash', stashRef: stash.name });
  }

  return { isHead, displayRefs };
}

/**
 * Returns a stable, unique React key for a DisplayRef.
 * Prefixes with the type to avoid collisions between e.g. a branch and tag
 * that share the same name on the same commit.
 */
export function displayRefKey(displayRef: DisplayRef): string {
  switch (displayRef.type) {
    case 'local-branch':  return `local-branch-${displayRef.localName}`;
    case 'remote-branch': return `remote-branch-${displayRef.remoteName}`;
    case 'merged-branch': return `merged-branch-${displayRef.localName}`;
    case 'tag':           return `tag-${displayRef.tagName}`;
    case 'stash':         return `stash-${displayRef.stashRef}`;
  }
}

/**
 * Converts a DisplayRef back to a RefInfo for use in context menus.
 * For merged-branch, returns the local branch RefInfo.
 * For remote-branch, parses the qualified name "remote/branch".
 */
export function displayRefToRefInfo(displayRef: DisplayRef): RefInfo {
  switch (displayRef.type) {
    case 'local-branch':
      return { type: 'branch', name: displayRef.localName };
    case 'merged-branch':
      return { type: 'branch', name: displayRef.localName };
    case 'remote-branch': {
      const slashIdx = displayRef.remoteName.indexOf('/');
      return {
        type: 'remote',
        name: displayRef.remoteName.slice(slashIdx + 1),
        remote: displayRef.remoteName.slice(0, slashIdx),
      };
    }
    case 'tag':
      return { type: 'tag', name: displayRef.tagName };
    case 'stash':
      return { type: 'stash', name: displayRef.stashRef };
  }
}
