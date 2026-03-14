import type { Commit } from '@shared/types';

export function filterCommits(commits: Commit[], query: string): number[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return commits.flatMap((commit, index) => {
    const subjectMatch = commit.subject.toLowerCase().includes(normalizedQuery);
    const authorMatch = commit.author.toLowerCase().includes(normalizedQuery);
    const hashMatch = normalizedQuery.length >= 4
      && (commit.hash.toLowerCase().startsWith(normalizedQuery)
        || commit.abbreviatedHash.toLowerCase().startsWith(normalizedQuery));

    return subjectMatch || authorMatch || hashMatch ? [index] : [];
  });
}
