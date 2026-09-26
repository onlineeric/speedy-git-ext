/**
 * The Parents / Children rows of the commit details panel (pure, unit-tested).
 *
 * Parents come from git (`CommitDetails.parents`). Children do not: git keeps no
 * link from a commit to its children, so they are read off the loaded commits.
 * That is complete for the current view — the log is `--date-order`, which never
 * lists a parent before all of its children, so any child the view contains is
 * loaded by the time its parent is.
 */
import type { Commit, CommitDetails } from '@shared/types';

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

/** The child links for a details view; every child is a loaded commit. */
export function buildChildLinks(commits: readonly Commit[], hash: string): RelatedCommitLink[] {
  return findChildCommits(commits, hash).map((commit) => ({
    hash: commit.hash,
    subject: commit.subject,
    navigable: true,
  }));
}

/** Tooltip for a Parents / Children hash link: the copy hint, then the subject. */
export function relatedCommitTooltip(link: Pick<RelatedCommitLink, 'hash' | 'subject'>): string {
  const copyHint = `Click to copy: ${link.hash}`;
  return link.subject ? `${copyHint}\n${link.subject}` : copyHint;
}
