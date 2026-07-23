import type { Branch, Commit, GraphFilters, StashEntry } from '@shared/types';
import { UNCOMMITTED_HASH } from '@shared/types';
import { calculateTopology, type GraphTopology } from './graphTopology';
import { buildUncommittedSubject } from './uncommittedUtils';

export interface UncommittedContext {
  hasUncommittedChanges: boolean;
  counts: { stagedCount: number; unstagedCount: number; untrackedCount: number };
  branches: Branch[];
}

/**
 * Insert synthetic stash commits into the commit list at the position of each stash's parent.
 * Stashes outside the active date filter range are excluded.
 */
export function mergeStashesIntoCommits(
  commits: Commit[],
  stashes: StashEntry[],
  filters?: GraphFilters,
): Commit[] {
  if (stashes.length === 0) return commits;

  const afterMs = filters?.afterDate ? new Date(filters.afterDate).getTime() : undefined;
  const beforeMs = filters?.beforeDate ? new Date(filters.beforeDate).getTime() : undefined;

  const merged = [...commits];
  const commitIndexByHash = new Map<string, number>();
  for (let i = 0; i < merged.length; i++) {
    commitIndexByHash.set(merged[i].hash, i);
  }

  const stashInsertions: { index: number; commit: Commit }[] = [];
  for (const stash of stashes) {
    const parentIndex = commitIndexByHash.get(stash.parentHash);
    if (parentIndex === undefined) continue;

    if (afterMs && stash.date < afterMs) continue;
    if (beforeMs && stash.date > beforeMs) continue;

    stashInsertions.push({
      index: parentIndex,
      commit: {
        hash: stash.hash,
        abbreviatedHash: stash.hash.slice(0, 7),
        parents: [stash.parentHash],
        author: stash.author,
        authorEmail: stash.authorEmail,
        authorDate: stash.date,
        subject: stash.message,
        refs: [{ name: `stash@{${stash.index}}`, type: 'stash' }],
      },
    });
  }

  stashInsertions.sort((a, b) => b.index - a.index);
  for (const { index, commit } of stashInsertions) {
    merged.splice(index, 0, commit);
  }

  return merged;
}

/**
 * Inject a synthetic uncommitted-changes node at the head of the commit list when the working
 * tree is dirty. Honors the active branch filter — the node is only injected when HEAD's branch
 * is selected (or no branch filter is active).
 */
export function mergeUncommittedIntoCommits(
  commits: Commit[],
  hasUncommittedChanges: boolean,
  counts: { stagedCount: number; unstagedCount: number; untrackedCount: number },
  branches: Branch[],
  filters?: GraphFilters,
): Commit[] {
  if (!hasUncommittedChanges) return commits;

  if (filters?.branches && filters.branches.length > 0) {
    const currentBranch = branches.find(b => b.current);
    if (currentBranch && !filters.branches.includes(currentBranch.name)) {
      return commits;
    }
  }

  if (commits.length === 0) return commits;

  // HEAD's commit may be outside the loaded batch (e.g. detached HEAD on an old
  // commit). Inject a standalone node then — same as any commit whose parent is
  // not loaded — instead of guessing a parent; the connection appears once
  // HEAD's commit is loaded.
  const headCommitHash = commits.find(c => c.refs.some(r => r.type === 'head'))?.hash;

  const syntheticCommit: Commit = {
    hash: UNCOMMITTED_HASH,
    abbreviatedHash: '---',
    parents: headCommitHash ? [headCommitHash] : [],
    author: '---',
    authorEmail: '',
    authorDate: Date.now(),
    subject: buildUncommittedSubject(counts.stagedCount, counts.unstagedCount, counts.untrackedCount),
    refs: [{ name: 'Uncommitted Changes', type: 'uncommitted' }],
  };

  return [syntheticCommit, ...commits];
}

/**
 * Build the displayed commit list and graph topology together.
 *
 * Visible commits (after hiding by author/text filters) are merged with stashes and any uncommitted
 * node for display. Topology is calculated from the *full* commit list (including hidden) so that
 * lane reservations remain stable when a filter toggles.
 */
export function computeMergedTopology(
  commits: Commit[],
  stashes: StashEntry[],
  filters?: GraphFilters,
  hiddenHashes?: Set<string>,
  uncommitted?: UncommittedContext,
): { mergedCommits: Commit[]; topology: GraphTopology } {
  const visibleCommits = hiddenHashes && hiddenHashes.size > 0
    ? commits.filter(c => !hiddenHashes.has(c.hash))
    : commits;
  let mergedCommits = mergeStashesIntoCommits(visibleCommits, stashes, filters);
  if (uncommitted) {
    mergedCommits = mergeUncommittedIntoCommits(mergedCommits, uncommitted.hasUncommittedChanges, uncommitted.counts, uncommitted.branches, filters);
  }
  let allWithStashes = mergeStashesIntoCommits(commits, stashes, filters);
  if (uncommitted) {
    allWithStashes = mergeUncommittedIntoCommits(allWithStashes, uncommitted.hasUncommittedChanges, uncommitted.counts, uncommitted.branches, filters);
  }
  return { mergedCommits, topology: calculateTopology(allWithStashes, hiddenHashes, mergedCommits) };
}
