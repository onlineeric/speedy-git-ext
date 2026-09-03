import { describe, it, expect } from 'vitest';
import type { Commit, RefInfo } from '@shared/types';
import { UNCOMMITTED_HASH } from '@shared/types';
import { filterCommits, type SearchSettings } from '../searchFilter';
import { parseSearchQuery } from '../searchQuery';

const ALL_VISIBLE: SearchSettings = { showTags: true, showRemoteBranches: true };

function commit(overrides: Partial<Commit>): Commit {
  return {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    abbreviatedHash: 'aaaaaaa',
    parents: [],
    author: 'Default',
    authorEmail: 'default@x',
    authorDate: 0,
    subject: 'default subject',
    refs: [],
    ...overrides,
  };
}

/** Matching commits for a raw query string, so tests read as a user types. */
function search(commits: Commit[], query: string, settings: SearchSettings = ALL_VISIBLE): number[] {
  return filterCommits(commits, parseSearchQuery(query), settings);
}

const localBranch = (name: string): RefInfo => ({ type: 'branch', name });
const remoteBranch = (remote: string, name: string): RefInfo => ({ type: 'remote', name, remote });
const tag = (name: string): RefInfo => ({ type: 'tag', name });

describe('filterCommits', () => {
  it('returns no matches for an empty query', () => {
    expect(search([commit({ subject: 'hello world' })], '')).toEqual([]);
  });

  it('returns no matches for a whitespace-only query', () => {
    expect(search([commit({ subject: 'hello world' })], '   ')).toEqual([]);
  });

  it('returns no matches for an empty term list', () => {
    expect(filterCommits([commit({ subject: 'hello' })], [], ALL_VISIBLE)).toEqual([]);
  });

  it('matches the subject case-insensitively', () => {
    const commits = [
      commit({ subject: 'Add feature' }),
      commit({ subject: 'Fix bug' }),
      commit({ subject: 'docs: update README' }),
    ];
    expect(search(commits, 'fix')).toEqual([1]);
    expect(search(commits, 'FEATURE')).toEqual([0]);
  });

  it('matches the author name', () => {
    const commits = [commit({ author: 'Alice' }), commit({ author: 'Bob' })];
    expect(search(commits, 'alice')).toEqual([0]);
  });

  it('matches the author email when the name does not', () => {
    const commits = [commit({ author: 'John Smith', authorEmail: 'jsmith@corp.com' })];
    expect(search(commits, 'jsmith')).toEqual([0]);
    expect(search(commits, 'corp.com')).toEqual([0]);
  });

  it('matches a hash by prefix only when the term has 4+ characters', () => {
    const commits = [
      commit({ hash: 'abcd1234ffffffffffffffffffffffffffffffff', abbreviatedHash: 'abcd1234' }),
      commit({ hash: 'ef561234ffffffffffffffffffffffffffffffff', abbreviatedHash: 'ef561234' }),
    ];
    expect(search(commits, 'abc')).toEqual([]);
    expect(search(commits, 'abcd')).toEqual([0]);
    expect(search(commits, 'ABCD')).toEqual([0]);
  });

  it('does not match a hash by substring', () => {
    const commits = [commit({ hash: 'abcd1234ffffffffffffffffffffffffffffffff', abbreviatedHash: 'abcd1234' })];
    expect(search(commits, '1234')).toEqual([]);
  });

  it('returns match indices in ascending row order', () => {
    const commits = [
      commit({ subject: 'fix the thing' }),
      commit({ subject: 'add feature' }),
      commit({ subject: 'fix another thing' }),
    ];
    expect(search(commits, 'fix')).toEqual([0, 2]);
  });

  describe('ref names', () => {
    it('matches a local branch name as a substring', () => {
      const commits = [commit({ refs: [localBranch('feature/new-ui')] })];
      expect(search(commits, 'feature')).toEqual([0]);
    });

    it('matches a tag name as a substring', () => {
      const commits = [commit({ refs: [tag('v1.2.0')] })];
      expect(search(commits, 'v1.2')).toEqual([0]);
    });

    it('matches a remote branch by its qualified name', () => {
      const commits = [commit({ refs: [remoteBranch('origin', 'main')] })];
      expect(search(commits, 'origin/main')).toEqual([0]);
    });

    it('matches a remote branch by its bare name', () => {
      // The badge's own label is `origin/main`, so substring matching gets this free.
      const commits = [commit({ refs: [remoteBranch('origin', 'main')] })];
      expect(search(commits, 'main')).toEqual([0]);
    });

    it('matches a merged branch through a remote name the badge never shows', () => {
      const commits = [commit({ refs: [localBranch('main'), remoteBranch('origin', 'main')] })];
      expect(search(commits, 'origin/main')).toEqual([0]);
    });

    it('matches a stash by its ref as well as its message', () => {
      const commits = [commit({ subject: 'WIP on dev', refs: [{ type: 'stash', name: 'stash@{0}' }] })];
      expect(search(commits, 'stash@{0}')).toEqual([0]);
      expect(search(commits, 'wip')).toEqual([0]);
    });
  });

  describe('hidden refs cannot match', () => {
    it('ignores a tag when Show tags is off', () => {
      const commits = [commit({ refs: [tag('v1.2.0')] })];
      expect(search(commits, 'v1.2', { showTags: false, showRemoteBranches: true })).toEqual([]);
    });

    it('ignores a remote branch when Show remote branches is off', () => {
      const commits = [commit({ refs: [remoteBranch('origin', 'release')] })];
      expect(search(commits, 'release', { showTags: true, showRemoteBranches: false })).toEqual([]);
    });

    it('keeps a merged branch’s local name but drops its remote names when remotes are hidden', () => {
      const commits = [commit({ refs: [localBranch('main'), remoteBranch('origin', 'main')] })];
      const settings = { showTags: true, showRemoteBranches: false };
      expect(search(commits, 'main', settings)).toEqual([0]);
      expect(search(commits, 'origin/main', settings)).toEqual([]);
    });
  });

  it('never matches the uncommitted row', () => {
    const commits = [commit({ hash: UNCOMMITTED_HASH, abbreviatedHash: '', subject: '3 staged, 2 unstaged' })];
    expect(search(commits, 'staged')).toEqual([]);
    expect(search(commits, 'uncommitted')).toEqual([]);
  });

  describe('multiple terms', () => {
    it('AND-s terms across different fields', () => {
      const commits = [
        commit({ author: 'John Smith', subject: 'fix the login bug' }),
        commit({ author: 'John Smith', subject: 'add a feature' }),
        commit({ author: 'Alice', subject: 'fix a thing' }),
      ];
      expect(search(commits, 'john fix')).toEqual([0]);
    });

    it('lets two terms match the same field', () => {
      const commits = [commit({ subject: 'fix the login bug' }), commit({ subject: 'fix the graph' })];
      expect(search(commits, 'fix login')).toEqual([0]);
    });

    it('rejects a commit when only some terms match', () => {
      const commits = [commit({ subject: 'fix the login bug', author: 'Alice' })];
      expect(search(commits, 'fix nonsense')).toEqual([]);
    });

    it('applies the hash floor per term, not per query', () => {
      const commits = [commit({
        subject: 'fix the thing',
        hash: 'a1b2c3d4ffffffffffffffffffffffffffffffff',
        abbreviatedHash: 'a1b2c3d',
      })];
      // `fix` is not hash-eligible; `a1b2` is, and matches as a prefix.
      expect(search(commits, 'fix a1b2')).toEqual([0]);
    });

    it('combines a tag term with a subject term', () => {
      const commits = [
        commit({ subject: 'release notes', refs: [tag('v1.2.0')] }),
        commit({ subject: 'release notes', refs: [tag('v2.0.0')] }),
      ];
      expect(search(commits, 'v1.2 release')).toEqual([0]);
    });
  });

  it('counts a commit once when it matches on several fields', () => {
    const commits = [commit({
      subject: 'main work',
      author: 'main-bot',
      refs: [localBranch('main')],
    })];
    expect(search(commits, 'main')).toEqual([0]);
  });
});
