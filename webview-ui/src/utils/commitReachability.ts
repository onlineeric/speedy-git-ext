import type { Commit } from '@shared/types';

export interface ReachabilityChecker {
  isReachableFromHead(commitHash: string, headHash: string): boolean;
  /**
   * Whether the commit sits on the head's *first-parent* chain with no merge
   * commit in between — i.e. the stretch of history from the head down to the
   * commit is linear.
   *
   * This is the question to ask before offering an operation that rewrites that
   * stretch (dropping a commit runs `git rebase -i <hash>~1`, which flattens any
   * merge it replays over). Plain reachability is too permissive: a commit
   * merged in from a side branch is reachable, but rewriting down to it would
   * silently linearize the merge.
   */
  isOnFirstParentChain(commitHash: string, headHash: string): boolean;
}

/**
 * Build a reachability checker that closes over a single commit-by-hash map. Use this when
 * many reachability questions are asked against the same commit set (e.g. a tooltip that
 * iterates over every commit) — the alternative `isReachableFromHead` rebuilds the map on
 * every call, which is O(n) per call.
 */
export function createReachabilityChecker(commits: Commit[]): ReachabilityChecker {
  const commitByHash = new Map<string, Commit>();
  for (const commit of commits) {
    commitByHash.set(commit.hash, commit);
  }

  function resolve(hash: string): string {
    if (commitByHash.has(hash)) return hash;
    let unique: string | null = null;
    for (const commit of commits) {
      if (!commit.hash.startsWith(hash)) continue;
      if (unique !== null) return hash;
      unique = commit.hash;
    }
    return unique ?? hash;
  }

  return {
    isReachableFromHead(commitHash, headHash) {
      const resolvedHead = resolve(headHash);
      const resolvedTarget = resolve(commitHash);
      const queue = [resolvedHead];
      const seen = new Set<string>();

      while (queue.length > 0) {
        const hash = queue.shift();
        if (!hash || seen.has(hash)) continue;
        if (hash === resolvedTarget) return true;

        seen.add(hash);
        const current = commitByHash.get(hash);
        if (!current) continue;

        for (const parent of current.parents) {
          queue.push(parent);
        }
      }

      return false;
    },

    isOnFirstParentChain(commitHash, headHash) {
      const resolvedTarget = resolve(commitHash);
      let hash: string | undefined = resolve(headHash);
      const seen = new Set<string>();

      while (hash && !seen.has(hash)) {
        if (hash === resolvedTarget) return true;
        seen.add(hash);

        const current: Commit | undefined = commitByHash.get(hash);
        // A merge between the tip and the target means history there cannot be
        // rewritten commit-by-commit, so stop rather than walking past it.
        if (!current || current.parents.length > 1) return false;
        hash = current.parents[0];
      }

      return false;
    },
  };
}

/**
 * One-shot reachability check. Builds a fresh commit-by-hash map on every call. Prefer
 * `createReachabilityChecker` when asking multiple questions against the same commit set.
 */
export function isReachableFromHead(commitHash: string, headHash: string, commits: Commit[]): boolean {
  return createReachabilityChecker(commits).isReachableFromHead(commitHash, headHash);
}
