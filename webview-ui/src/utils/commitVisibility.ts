import type { Commit, GraphFilters } from '@shared/types';
import { isBadgedCommit, type BadgeSettings } from './mergeRefs';

export interface VisibilityOptions {
  /** Keep commits that fail the Author / Message filters visible when they show a badge. */
  alwaysShowBadgedCommits: boolean;
  badgeSettings: BadgeSettings;
}

export interface CommitVisibility {
  /** Commits removed from the graph by the Author / Message filters. */
  hiddenCommitHashes: Set<string>;
  /** Commits that fail those filters but stay visible because they carry a badge (rendered dimmed). */
  badgeKeptCommitHashes: Set<string>;
}

function failsAuthorOrTextFilter(
  commit: Commit,
  includedAuthors: Set<string> | null,
  textLower: string,
): boolean {
  if (includedAuthors && !includedAuthors.has(commit.authorEmail)) return true;
  if (!textLower) return false;
  const subjectMatch = commit.subject.toLowerCase().includes(textLower);
  const hashMatch = textLower.length >= 4 && commit.hash.startsWith(textLower);
  return !subjectMatch && !hashMatch;
}

/**
 * Compute which commits the client-side visibility filters hide, in a single pass.
 * Author and text filters combine with AND semantics. With `alwaysShowBadgedCommits`,
 * a commit failing them stays visible (and is reported as badge-kept) when it shows a badge.
 * Dates and Branches are applied by `git log` in the backend and are not relaxed here.
 * Stash and uncommitted entries are excluded (they are merged separately after filtering).
 */
export function computeCommitVisibility(
  commits: Commit[],
  filters: GraphFilters,
  options: VisibilityOptions,
): CommitVisibility {
  const hiddenCommitHashes = new Set<string>();
  const badgeKeptCommitHashes = new Set<string>();
  if (!hasClientSideVisibilityFilter(filters)) return { hiddenCommitHashes, badgeKeptCommitHashes };

  const includedAuthors = filters.authors?.length ? new Set(filters.authors) : null;
  const textLower = filters.textFilter?.toLowerCase() ?? '';

  for (const commit of commits) {
    if (commit.refs.some(r => r.type === 'stash' || r.type === 'uncommitted')) continue;
    if (!failsAuthorOrTextFilter(commit, includedAuthors, textLower)) continue;

    if (options.alwaysShowBadgedCommits && isBadgedCommit(commit, options.badgeSettings)) {
      badgeKeptCommitHashes.add(commit.hash);
    } else {
      hiddenCommitHashes.add(commit.hash);
    }
  }
  return { hiddenCommitHashes, badgeKeptCommitHashes };
}

/** Whether an Author or Message filter is active — the only filters the badge option relaxes. */
export function hasClientSideVisibilityFilter(filters: GraphFilters): boolean {
  return (!!filters.authors && filters.authors.length > 0) || !!filters.textFilter;
}
