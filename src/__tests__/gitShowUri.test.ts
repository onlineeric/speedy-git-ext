import { describe, it, expect } from 'vitest';
import {
  buildGitShowUriParts,
  parseGitShowUriParts,
  STAGED_AUTHORITY,
  WORKTREE_AUTHORITY,
  type GitShowUriParts,
} from '../utils/gitShowUri.js';

function roundTrip(parts: GitShowUriParts): GitShowUriParts | null {
  const built = buildGitShowUriParts(parts);
  return parseGitShowUriParts(built);
}

describe('buildGitShowUriParts', () => {
  it('puts the revision in the authority, the file in the query and the repo in the fragment', () => {
    const built = buildGitShowUriParts({
      repoPath: '/repos/a',
      revision: 'abc1234',
      filePath: 'src/index.ts',
      label: 'abc1234: index.ts',
    });

    expect(built).toEqual({
      authority: 'abc1234',
      path: '/abc1234: index.ts',
      query: 'src/index.ts',
      fragment: 'repo=%2Frepos%2Fa',
    });
  });

  it('gives two repos with the same file at the same hash different fragments', () => {
    const base = { revision: 'abc1234', filePath: 'src/index.ts', label: 'x' };
    const a = buildGitShowUriParts({ ...base, repoPath: '/repos/a' });
    const b = buildGitShowUriParts({ ...base, repoPath: '/repos/b' });
    expect(a.fragment).not.toBe(b.fragment);
  });

  it('gives two views of one file in one repo an identical URI, so they share a document', () => {
    const parts = { repoPath: '/repos/a', revision: 'abc1234', filePath: 'src/index.ts', label: 'x' };
    expect(buildGitShowUriParts(parts)).toEqual(buildGitShowUriParts(parts));
  });

  it('carries a nonce alongside the repo when one is supplied', () => {
    const built = buildGitShowUriParts({
      repoPath: '/repos/a',
      revision: WORKTREE_AUTHORITY,
      filePath: 'sub',
      label: 'Working Tree: sub',
      nonce: 'ab-12',
    });
    expect(built.fragment).toBe('repo=%2Frepos%2Fa&nonce=ab-12');
  });
});

describe('parseGitShowUriParts', () => {
  it('round-trips an ordinary commit revision', () => {
    const parts: GitShowUriParts = {
      repoPath: '/repos/a',
      revision: 'abc1234',
      filePath: 'src/index.ts',
      label: 'abc1234: index.ts',
    };
    expect(roundTrip(parts)).toEqual(parts);
  });

  it('round-trips both sentinels', () => {
    for (const revision of [STAGED_AUTHORITY, WORKTREE_AUTHORITY]) {
      const parts: GitShowUriParts = { repoPath: '/repos/a', revision, filePath: 'f.ts', label: 'f.ts' };
      expect(roundTrip(parts)).toEqual(parts);
    }
  });

  it('round-trips a repo path containing #, ? and &', () => {
    const parts: GitShowUriParts = {
      repoPath: '/repos/we#ird?stuff&more',
      revision: 'abc1234',
      filePath: 'f.ts',
      label: 'f.ts',
    };
    expect(roundTrip(parts)?.repoPath).toBe('/repos/we#ird?stuff&more');
  });

  it('round-trips spaces and non-ASCII in the repo path', () => {
    const parts: GitShowUriParts = {
      repoPath: '/repos/my repo/日本語',
      revision: 'abc1234',
      filePath: 'f.ts',
      label: 'f.ts',
    };
    expect(roundTrip(parts)?.repoPath).toBe('/repos/my repo/日本語');
  });

  it('round-trips a Windows drive letter and backslashes', () => {
    const parts: GitShowUriParts = {
      repoPath: 'c:\\Users\\eric\\repos\\a',
      revision: 'abc1234',
      filePath: 'src/index.ts',
      label: 'x',
    };
    expect(roundTrip(parts)?.repoPath).toBe('c:\\Users\\eric\\repos\\a');
  });

  it('round-trips a nonce', () => {
    const parts: GitShowUriParts = {
      repoPath: '/repos/a',
      revision: WORKTREE_AUTHORITY,
      filePath: 'sub',
      label: 'Working Tree: sub',
      nonce: 'ab-12',
    };
    expect(roundTrip(parts)).toEqual(parts);
  });

  it('rejects a missing authority', () => {
    expect(parseGitShowUriParts({ authority: '', query: 'f.ts', fragment: 'repo=%2Frepos%2Fa' })).toBeNull();
  });

  it('rejects a missing file path', () => {
    expect(parseGitShowUriParts({ authority: 'abc1234', query: '', fragment: 'repo=%2Frepos%2Fa' })).toBeNull();
  });

  it('rejects a fragment-less URI rather than guessing a repository', () => {
    expect(parseGitShowUriParts({ authority: 'abc1234', query: 'f.ts', fragment: '' })).toBeNull();
  });

  it('rejects a fragment that carries no repo field', () => {
    expect(parseGitShowUriParts({ authority: 'abc1234', query: 'f.ts', fragment: 'nonce=ab-12' })).toBeNull();
  });
});
