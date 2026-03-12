import type { Commit } from '@shared/types';

function resolveCommitHash(hash: string, commits: Commit[]): string {
  if (commits.some((commit) => commit.hash === hash)) {
    return hash;
  }

  const matches = commits.filter((commit) => commit.hash.startsWith(hash));
  return matches.length === 1 ? matches[0].hash : hash;
}

export function isReachableFromHead(commitHash: string, headHash: string, commits: Commit[]): boolean {
  const resolvedHeadHash = resolveCommitHash(headHash, commits);
  const resolvedCommitHash = resolveCommitHash(commitHash, commits);
  const commitMap = new Map(commits.map((item) => [item.hash, item]));
  const queue = [resolvedHeadHash];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const hash = queue.shift();
    if (!hash || seen.has(hash)) continue;
    if (hash === resolvedCommitHash) return true;

    seen.add(hash);
    const current = commitMap.get(hash);
    if (!current) continue;

    for (const parent of current.parents) {
      queue.push(parent);
    }
  }

  return false;
}
