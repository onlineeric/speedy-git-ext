/**
 * The Parents / Children rows of the commit details panel (pure, unit-tested).
 *
 * Parents come from git (`CommitDetails.parents`). Children do not: git keeps no
 * link from a commit to its children, so they are read off the loaded commits
 * plus the revealed commits fetched from outside the filtered stream (GH #214).
 * The log is `--date-order`, which never lists a parent before all of its
 * children, so any child the stream contains is loaded by the time its parent is.
 * A child outside the stream (newer than a Date filter's end, or the child of a
 * revealed commit) is never loaded and so not listed — discovering it would cost
 * a history walk per details open — which `childrenMayBeIncomplete` warns about.
 */
import type { Commit, CommitDetails, GraphFilters } from '@shared/types';

/** One hash in a Parents / Children row. */
export interface RelatedCommitLink {
  hash: string;
  /** Subject line for the tooltip; undefined when it is not known. */
  subject?: string;
  /** Whether the row offers "Go to …" for this hash. */
  navigable: boolean;
}

/** Loaded commits that list `hash` as a parent, in graph order. */
export function findChildCommits(commits: readonly Commit[], hash: string): Commit[] {
  return commits.filter((commit) => commit.parents.includes(hash));
}

/**
 * The parent links for a details view.
 *
 * A stash has two or three parents, but only the first is a commit in the graph;
 * the others are git's internal index/untracked commits, which are never shown.
 * They stay copyable, but only the first parent can be navigated to.
 */
export function buildParentLinks(
  details: Pick<CommitDetails, 'parents' | 'parentSubjects'>,
  commits: readonly Commit[],
  isStash: boolean,
): RelatedCommitLink[] {
  return details.parents.map((hash, index) => ({
    hash,
    // The backend's answer covers parents that are not loaded; the loaded commit
    // covers details built without it (the uncommitted row's HEAD parent).
    subject: details.parentSubjects?.[index] ?? commits.find((commit) => commit.hash === hash)?.subject,
    navigable: !isStash || index === 0,
  }));
}

/** The child links for a details view; every child is a loaded (or revealed) commit. */
export function buildChildLinks(commits: readonly Commit[], hash: string): RelatedCommitLink[] {
  return findChildCommits(commits, hash).map((commit) => ({
    hash: commit.hash,
    subject: commit.subject,
    navigable: true,
  }));
}

/**
 * Whether the Children row may be missing children the repository has. Reason-
 * agnostic on purpose: the panel shows one generic note, so a new cause is one
 * more condition here, never a new message.
 *
 * - A Date filter end: children newer than the range are never loaded. A start
 *   alone cannot hide a loaded commit's children — they are newer, so in range.
 * - A revealed commit from outside the stream: its children may be outside too.
 *
 * The Branch filter never counts: a child on an unselected branch is outside
 * what the user asked to see.
 */
export function childrenMayBeIncomplete(
  filters: Pick<GraphFilters, 'beforeDate'>,
  isRevealedExtra: boolean,
): boolean {
  return !!filters.beforeDate || isRevealedExtra;
}

/** Tooltip for a Parents / Children hash link: the copy hint, then the subject. */
export function relatedCommitTooltip(link: Pick<RelatedCommitLink, 'hash' | 'subject'>): string {
  const copyHint = `Click to copy: ${link.hash}`;
  return link.subject ? `${copyHint}\n${link.subject}` : copyHint;
}
