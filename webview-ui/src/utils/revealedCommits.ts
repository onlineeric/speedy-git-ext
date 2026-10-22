/**
 * Revealed commits fetched from outside the backend-filtered stream (GH #214),
 * merged into the loaded commit list (pure, unit-tested).
 *
 * They are never stored in `commits` — pagination counts the loaded stream —
 * so the merged list is rebuilt on every recompute, which also keeps an extra
 * in place as more batches load around it.
 */
import type { Commit } from '@shared/types';

export interface MergedRevealedCommits {
  /** Loaded commits with the extras inserted; `commits` itself when there is nothing to insert. */
  commits: Commit[];
  /** The extras that are still not loaded; `extras` itself when none became loaded. */
  unloadedExtras: readonly Commit[];
}

/**
 * Insert each extra at its date-order position, but never above a commit that
 * lists it as a parent nor below one of its own parents — topology needs
 * children before parents. Ties go after. An extra that has since been loaded
 * normally is skipped and reported as no longer unloaded.
 */
export function mergeRevealedExtraCommits(commits: Commit[], extras: readonly Commit[]): MergedRevealedCommits {
  if (extras.length === 0) return { commits, unloadedExtras: extras };

  const loadedHashes = new Set(commits.map((commit) => commit.hash));
  const pending = extras.filter((extra) => !loadedHashes.has(extra.hash));
  const unloadedExtras = pending.length === extras.length ? extras : pending;
  if (pending.length === 0) return { commits, unloadedExtras };

  const merged = [...commits];
  for (const extra of [...pending].sort((a, b) => b.authorDate - a.authorDate)) {
    merged.splice(insertionIndex(merged, extra), 0, extra);
  }
  return { commits: merged, unloadedExtras };
}

function insertionIndex(list: readonly Commit[], extra: Commit): number {
  let lowest = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].parents.includes(extra.hash)) {
      lowest = i + 1;
      break;
    }
  }
  let highest = list.length;
  for (let i = lowest; i < list.length; i++) {
    if (extra.parents.includes(list[i].hash)) {
      highest = i;
      break;
    }
  }
  for (let i = lowest; i < highest; i++) {
    if (list[i].authorDate < extra.authorDate) return i;
  }
  return highest;
}
