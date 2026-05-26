import type { Commit, Branch, RefInfo } from '../../shared/types.js';

const NULL_CHAR = '\x00';

export function isConflictStderr(stderr: string): boolean {
  return stderr.includes('CONFLICT') || stderr.toLowerCase().includes('merge conflict');
}

export function parseCommitLine(line: string): Commit | null {
  const parts = line.split(NULL_CHAR);
  if (parts.length < 7) {
    return null;
  }

  const [hash, abbreviatedHash, parentStr, author, authorEmail, authorDateStr, subject, refsStr] = parts;

  const parents = parentStr ? parentStr.split(' ').filter(Boolean) : [];
  const authorDate = parseInt(authorDateStr, 10) * 1000;
  const refs = refsStr ? parseRefs(refsStr) : [];

  return {
    hash,
    abbreviatedHash,
    parents,
    author,
    authorEmail,
    authorDate,
    subject,
    refs,
  };
}

export function parseRefs(refsStr: string): RefInfo[] {
  if (!refsStr.trim()) {
    return [];
  }

  const refs: RefInfo[] = [];
  const refParts = refsStr.split(',').map((s) => s.trim());

  for (const part of refParts) {
    const refInfo = parseRefPart(part);
    if (refInfo) {
      refs.push(refInfo);
    }
  }

  return refs;
}

function parseRefPart(part: string): RefInfo | null {
  if (!part) {
    return null;
  }

  if (part.startsWith('HEAD -> ')) {
    const branchName = part.slice('HEAD -> '.length);
    return { name: branchName, type: 'head' };
  }

  if (part === 'HEAD') {
    return { name: 'HEAD', type: 'head' };
  }

  if (part.startsWith('tag: ')) {
    const tagName = part.slice('tag: '.length);
    return { name: tagName, type: 'tag' };
  }

  if (part.startsWith('refs/')) {
    return parseQualifiedRef(part);
  }

  // Stash ref (e.g. "refs/stash") — should not normally appear since stash
  // refs are excluded from git log, but handle defensively.
  if (part === 'refs/stash' || part.startsWith('stash@{')) {
    return { name: part, type: 'stash' };
  }

  // Check for remote branches - refs from git log %D format include "origin/branch"
  // We check for common remote prefixes to distinguish from local branches with slashes
  const commonRemotes = ['origin', 'upstream', 'fork'];
  const slashIndex = part.indexOf('/');

  if (slashIndex > 0) {
    const potentialRemote = part.slice(0, slashIndex);
    // Only treat as remote if it starts with a known remote prefix
    if (commonRemotes.includes(potentialRemote)) {
      const branchName = part.slice(slashIndex + 1);
      // Skip `<remote>/HEAD` — it's git's symbolic ref recording the remote's default
      // branch, not a real branch. Surfacing it as a branch led to actions like
      // `git fetch origin HEAD:HEAD` creating a stray local `refs/heads/HEAD`.
      if (branchName === 'HEAD') return null;
      return { name: branchName, type: 'remote', remote: potentialRemote };
    }
  }

  // Local branch (may contain slashes like "feature/login")
  return { name: part, type: 'branch' };
}

function parseQualifiedRef(refName: string): RefInfo | null {
  if (refName.startsWith('refs/heads/')) {
    return { name: refName.slice('refs/heads/'.length), type: 'branch' };
  }

  if (refName.startsWith('refs/remotes/')) {
    const remoteRef = refName.slice('refs/remotes/'.length);
    const slashIndex = remoteRef.indexOf('/');
    if (slashIndex <= 0) return null;

    const remote = remoteRef.slice(0, slashIndex);
    const branchName = remoteRef.slice(slashIndex + 1);
    if (!branchName || branchName === 'HEAD') return null;

    return { name: branchName, type: 'remote', remote };
  }

  if (refName.startsWith('refs/tags/')) {
    return { name: refName.slice('refs/tags/'.length), type: 'tag' };
  }

  if (refName === 'refs/stash') {
    return { name: refName, type: 'stash' };
  }

  return null;
}

export function parseBranchLine(line: string): Branch | null {
  // Format: refname\x00HEAD_marker\x00hash
  const parts = line.split(NULL_CHAR);
  if (parts.length !== 3) {
    return null;
  }

  const [rawName, headMarker, hash] = parts;
  const trimmedName = rawName.trim();
  const isCurrent = headMarker === '*';

  // Determine if this is a remote branch
  // Remote branches from `git branch -a` have format like "remotes/origin/branch" or "origin/branch"
  let branchName = trimmedName;
  let remote: string | undefined;

  // Strip "remotes/" prefix if present (from `git branch -a` output)
  if (branchName.startsWith('remotes/')) {
    branchName = branchName.slice('remotes/'.length);
  }

  // Check if this is a remote tracking branch (e.g., "origin/main")
  // Only split on first slash and check against common remote patterns
  const slashIndex = branchName.indexOf('/');
  if (slashIndex > 0) {
    const potentialRemote = branchName.slice(0, slashIndex);
    const restOfName = branchName.slice(slashIndex + 1);

    // For branches from `git branch -a`, remote branches are always prefixed with remote name
    // We treat any branch with format "xxx/yyy" where the branch came from -a as remote
    // unless it's clearly a local branch pattern
    // Since we're using `git branch -a`, branches like "origin/main" ARE remote branches
    if (restOfName && !potentialRemote.includes('-')) {
      // Likely a remote - remote names typically don't have dashes followed by feature names
      // This heuristic works for most cases: origin/main, upstream/feature
      // But local branches like feature/login have "feature" which could match
      // Better approach: check if the first part looks like a remote name (short, no special chars)
      const looksLikeRemote = /^[a-z][a-z0-9_-]*$/i.test(potentialRemote) && potentialRemote.length <= 20;
      if (looksLikeRemote && !['feature', 'bugfix', 'hotfix', 'release', 'fix', 'feat', 'chore', 'docs', 'test', 'refactor'].includes(potentialRemote.toLowerCase())) {
        remote = potentialRemote;
        branchName = restOfName;
      }
    }
  }

  // Drop `<remote>/HEAD` — symbolic ref pointing at the remote's default branch,
  // not a branch we should let users act on.
  if (remote && branchName === 'HEAD') {
    return null;
  }

  return {
    name: branchName,
    remote,
    current: isCurrent,
    hash: hash.trim(),
  };
}
