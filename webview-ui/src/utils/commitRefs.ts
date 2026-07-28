/**
 * Predicates that identify a graph row by the refs decorating it.
 *
 * Rows are told apart by their decorations rather than by a flag on the commit:
 * HEAD is "the row carrying a `head` ref", a stash is "the row carrying a
 * `stash` ref". Several unrelated places ask those questions — topology, the
 * uncommitted node's parent, the tooltip, Go to HEAD — so the rules live here
 * once instead of being re-spelled at each call site.
 */
import type { Commit } from '@shared/types';

/** Minimal shape needed to spot a row by its decorations. */
interface DecoratedRow {
  hash: string;
  refs?: readonly { type: string }[];
}

/**
 * The row git currently has checked out, or undefined when HEAD is not in the
 * given list — it may be deeper than the loaded batches, or hidden by a filter.
 */
export function findHeadCommit<T extends DecoratedRow>(commits: readonly T[]): T | undefined {
  return commits.find((commit) => commit.refs?.some((ref) => ref.type === 'head'));
}

/** Hash of {@link findHeadCommit}, or null when HEAD is not in the given list. */
export function findHeadCommitHash(commits: readonly DecoratedRow[]): string | null {
  return findHeadCommit(commits)?.hash ?? null;
}

/** A stash entry rendered into the graph as a pseudo-commit. */
export function isStashPseudoCommit(commit: Commit): boolean {
  return commit.refs.some((ref) => ref.type === 'stash');
}
