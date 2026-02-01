import type { Commit, Branch, RefInfo } from '../../shared/types.js';

const NULL_CHAR = '\x00';

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

  if (part.startsWith('origin/') || part.includes('/')) {
    const slashIndex = part.indexOf('/');
    const remote = part.slice(0, slashIndex);
    const branchName = part.slice(slashIndex + 1);
    return { name: branchName, type: 'remote', remote };
  }

  return { name: part, type: 'branch' };
}

export function parseBranchLine(line: string): Branch | null {
  const match = line.match(/^(.+?)(\*?)([a-f0-9]+)$/);
  if (!match) {
    return null;
  }

  const [, name, currentMarker, hash] = match;
  const trimmedName = name.trim();

  const isRemote = trimmedName.startsWith('remotes/') || trimmedName.includes('/');
  let remote: string | undefined;
  let branchName = trimmedName;

  if (isRemote) {
    if (trimmedName.startsWith('remotes/')) {
      branchName = trimmedName.slice('remotes/'.length);
    }
    const slashIndex = branchName.indexOf('/');
    if (slashIndex > 0) {
      remote = branchName.slice(0, slashIndex);
      branchName = branchName.slice(slashIndex + 1);
    }
  }

  return {
    name: branchName,
    remote,
    current: currentMarker === '*',
    hash,
  };
}
