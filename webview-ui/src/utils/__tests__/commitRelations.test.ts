import { describe, it, expect } from 'vitest';
import type { Commit } from '@shared/types';
import { buildChildLinks, buildParentLinks, findChildCommits, relatedCommitTooltip } from '../commitRelations';

function commit(hash: string, parents: string[], subject = `subject ${hash}`): Commit {
  return { hash, abbreviatedHash: hash.slice(0, 7), parents, author: 'A', authorEmail: 'a@x', authorDate: 0, subject, refs: [] };
}

const commits = [
  commit('merge', ['main1', 'feat1']),
  commit('child2', ['main1']),
  commit('main1', ['root']),
  commit('feat1', ['root']),
  commit('root', []),
];

describe('findChildCommits', () => {
  it('finds every loaded commit that lists the hash as a parent, in graph order', () => {
    expect(findChildCommits(commits, 'main1').map((c) => c.hash)).toEqual(['merge', 'child2']);
  });

  it('finds nothing for a branch tip', () => {
    expect(findChildCommits(commits, 'merge')).toEqual([]);
  });
});

describe('buildParentLinks', () => {
  it('prefers the backend subject, then falls back to the loaded commit', () => {
    expect(buildParentLinks({ parents: ['main1', 'feat1'], parentSubjects: ['from git', 'second'] }, commits, false))
      .toEqual([
        { hash: 'main1', subject: 'from git', navigable: true },
        { hash: 'feat1', subject: 'second', navigable: true },
      ]);
    expect(buildParentLinks({ parents: ['main1'] }, commits, false))
      .toEqual([{ hash: 'main1', subject: 'subject main1', navigable: true }]);
  });

  it('leaves the subject unknown for an unloaded parent without a backend subject', () => {
    expect(buildParentLinks({ parents: ['deep'] }, commits, false)).toEqual([{ hash: 'deep', subject: undefined, navigable: true }]);
  });

  it('only lets a stash navigate to its first parent', () => {
    const links = buildParentLinks({ parents: ['main1', 'index', 'untracked'] }, commits, true);
    expect(links.map((link) => link.navigable)).toEqual([true, false, false]);
  });
});

describe('buildChildLinks', () => {
  it('carries each child subject and is always navigable', () => {
    expect(buildChildLinks(commits, 'feat1')).toEqual([{ hash: 'merge', subject: 'subject merge', navigable: true }]);
  });
});

describe('relatedCommitTooltip', () => {
  it('shows the copy hint and the subject on the next line', () => {
    expect(relatedCommitTooltip({ hash: 'abc', subject: 'fix: bug' })).toBe('Click to copy: abc\nfix: bug');
  });

  it('shows only the copy hint when the subject is unknown', () => {
    expect(relatedCommitTooltip({ hash: 'abc' })).toBe('Click to copy: abc');
  });
});
