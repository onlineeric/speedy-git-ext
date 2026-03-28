import type { ExternalRef } from '@shared/types';

export function parseExternalRefs(
  subject: string,
  githubOwnerRepo: { owner: string; repo: string } | null
): ExternalRef[] {
  const refs: ExternalRef[] = [];
  const seen = new Set<string>();

  // Match #123 style GitHub PR/issue references
  // Avoid matching inside URLs (preceded by /) or hex colors (preceded by nothing meaningful)
  const issuePattern = /(?:^|[^/\w])#(\d+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = issuePattern.exec(subject)) !== null) {
    const number = match[1];
    const label = `#${number}`;
    if (seen.has(label)) continue;
    seen.add(label);

    const url = githubOwnerRepo
      ? `https://github.com/${githubOwnerRepo.owner}/${githubOwnerRepo.repo}/issues/${number}`
      : null;

    refs.push({ label, url, type: 'pr-or-issue' });
  }

  // Match JIRA-style references (PROJECT-123)
  const jiraPattern = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
  while ((match = jiraPattern.exec(subject)) !== null) {
    const label = match[1];
    if (seen.has(label)) continue;
    seen.add(label);
    refs.push({ label, url: null, type: 'jira' });
  }

  return refs;
}
