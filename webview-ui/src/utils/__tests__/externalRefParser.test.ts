import { describe, it, expect } from 'vitest';
import { parseExternalRefs } from '../externalRefParser';

const REPO = { owner: 'acme', repo: 'widgets' };

describe('parseExternalRefs — PR/issue references', () => {
  it('extracts a #123 reference and builds a GitHub URL when repo is known', () => {
    const refs = parseExternalRefs('Fix crash #123', REPO);
    expect(refs).toEqual([
      {
        label: '#123',
        url: 'https://github.com/acme/widgets/issues/123',
        type: 'pr-or-issue',
      },
    ]);
  });

  it('leaves url null when the GitHub owner/repo is unknown', () => {
    const refs = parseExternalRefs('Fix crash #123', null);
    expect(refs).toEqual([{ label: '#123', url: null, type: 'pr-or-issue' }]);
  });

  it('matches a reference at the start of the subject', () => {
    const refs = parseExternalRefs('#7 initial commit', REPO);
    expect(refs.map((r) => r.label)).toEqual(['#7']);
  });

  it('captures multiple distinct references', () => {
    const refs = parseExternalRefs('Merge #1 and #2', REPO);
    expect(refs.map((r) => r.label)).toEqual(['#1', '#2']);
  });

  it('deduplicates a repeated reference', () => {
    const refs = parseExternalRefs('Revert #5, re-do #5', REPO);
    expect(refs.filter((r) => r.type === 'pr-or-issue').map((r) => r.label)).toEqual(['#5']);
  });

  it('does not match a # inside a URL path (e.g. hex fragment after a slash)', () => {
    const refs = parseExternalRefs('See http://x.test/page#42 for details', REPO);
    expect(refs.filter((r) => r.type === 'pr-or-issue')).toHaveLength(0);
  });

  it('ignores a bare # with no number', () => {
    expect(parseExternalRefs('a # b', REPO)).toEqual([]);
  });
});

describe('parseExternalRefs — JIRA references', () => {
  it('extracts a PROJECT-123 style reference with a null url', () => {
    const refs = parseExternalRefs('PROJ-42 implement feature', REPO);
    expect(refs).toEqual([{ label: 'PROJ-42', url: null, type: 'jira' }]);
  });

  it('captures multiple JIRA keys', () => {
    const refs = parseExternalRefs('ABC-1 and DEF-22 done', REPO);
    expect(refs.map((r) => r.label)).toEqual(['ABC-1', 'DEF-22']);
  });

  it('does not treat a lowercase prefix as a JIRA key', () => {
    expect(parseExternalRefs('abc-1 nope', REPO)).toEqual([]);
  });

  it('deduplicates a repeated JIRA key', () => {
    const refs = parseExternalRefs('PROJ-7 then PROJ-7 again', REPO);
    expect(refs).toEqual([{ label: 'PROJ-7', url: null, type: 'jira' }]);
  });
});

describe('parseExternalRefs — mixed and empty inputs', () => {
  it('returns both a PR ref and a JIRA ref from one subject', () => {
    const refs = parseExternalRefs('PROJ-9: fix #3', REPO);
    expect(refs).toEqual([
      { label: '#3', url: 'https://github.com/acme/widgets/issues/3', type: 'pr-or-issue' },
      { label: 'PROJ-9', url: null, type: 'jira' },
    ]);
  });

  it('returns an empty array when there are no references', () => {
    expect(parseExternalRefs('just a normal commit message', REPO)).toEqual([]);
  });
});
