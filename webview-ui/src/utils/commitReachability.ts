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
 * Build a reachability checker that closes over a single commit-by-hash map.
 *
 * Private on purpose: `getReachabilityChecker` is the only way in, so no caller
 * can accidentally pay the O(n) map build per question. See its comment for why
 * that matters.
 */
function createReachabilityChecker(commits: Commit[]): ReachabilityChecker {
  const commitByHash = new Map<string, Commit>();
  let fullHashLength = 0;
  for (const commit of commits) {
    commitByHash.set(commit.hash, commit);
    fullHashLength = Math.max(fullHashLength, commit.hash.length);
  }

  function resolve(hash: string): string {
    if (commitByHash.has(hash)) return hash;
    // Only an abbreviation can need the scan below. A hash already at full
    // length can only `startsWith`-match a commit it equals, which the map
    // lookup just ruled out — so scanning would walk the whole list to return
    // `hash` unchanged. That is the common case here: callers pass HEAD's full
    // hash, and HEAD is frequently outside the loaded window.
    if (hash.length >= fullHashLength) return hash;

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

      // Walked with a cursor rather than `shift()`: shifting re-indexes the whole
      // array each time, which turns this into O(n²) on the tens-of-thousands-of-
      // commits lists a "Go to HEAD" navigation can leave loaded.
      for (let i = 0; i < queue.length; i++) {
        const hash = queue[i];
        if (seen.has(hash)) continue;
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
 * Cached by commit-list identity, so the O(n) map build is paid once per commit
 * list rather than once per caller. Several components ask reachability
 * questions about the same list at the same time — every context menu the user
 * has opened keeps one alive — and the list can run to tens of thousands of
 * commits after a "Go to HEAD" navigation. Entries die with their array.
 */
const checkerByCommits = new WeakMap<Commit[], ReachabilityChecker>();

export function getReachabilityChecker(commits: Commit[]): ReachabilityChecker {
  const cached = checkerByCommits.get(commits);
  if (cached) return cached;

  const checker = createReachabilityChecker(commits);
  checkerByCommits.set(commits, checker);
  return checker;
}
