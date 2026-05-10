import type { Commit, GraphFilters } from '@shared/types';

/**
 * Compute the set of commit hashes that should be hidden by active visibility filters.
 * Author and text filters are applied in a single pass (AND semantics).
 * Stash and uncommitted entries are excluded (they are merged separately after filtering).
 */
export function computeHiddenCommitHashes(commits: Commit[], filters: GraphFilters): Set<string> {
  const hidden = new Set<string>();
  const hasAuthorFilter = !!filters.authors && filters.authors.length > 0;
  const hasTextFilter = !!filters.textFilter;

  if (!hasAuthorFilter && !hasTextFilter) return hidden;

  const includedAuthors = hasAuthorFilter ? new Set(filters.authors) : null;
  const textLower = hasTextFilter ? filters.textFilter!.toLowerCase() : '';

  for (const commit of commits) {
    if (commit.refs.some(r => r.type === 'stash' || r.type === 'uncommitted')) continue;

    if (includedAuthors && !includedAuthors.has(commit.authorEmail)) {
      hidden.add(commit.hash);
      continue;
    }

    if (hasTextFilter) {
      const subjectMatch = commit.subject.toLowerCase().includes(textLower);
      const hashMatch = textLower.length >= 4 && commit.hash.startsWith(textLower);
      if (!subjectMatch && !hashMatch) {
        hidden.add(commit.hash);
      }
    }
  }
  return hidden;
}
