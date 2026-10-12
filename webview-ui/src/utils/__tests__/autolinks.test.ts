import { describe, expect, it } from 'vitest';
import type { CustomAutolink } from '@shared/autolinks';
import type { RemoteInfo } from '@shared/types';
import {
  EMPTY_AUTOLINK_RULES,
  buildAutolinkRules,
  findAutolinks,
  getAutolinkRules,
  splitAutolinkSegments,
} from '../autolinks';
import type { RemoteAutolinkTarget } from '../remoteAutolinkTarget';

const JIRA: CustomAutolink = { prefix: 'ABCD-', url: 'https://jira.example.com/browse/ABCD-<num>' };
const GITHUB: RemoteAutolinkTarget = { provider: 'github', webBaseUrl: 'https://github.com', repoPath: 'acme/widgets' };
const GITLAB: RemoteAutolinkTarget = { provider: 'gitlab', webBaseUrl: 'https://gitlab.com', repoPath: 'group/sub/app' };

/** The linked text and its URL, in order. */
function links(text: string, custom: CustomAutolink[], target: RemoteAutolinkTarget | null) {
  return findAutolinks(text, buildAutolinkRules(custom, target)).map((match) => [
    text.slice(match.start, match.end),
    match.url,
  ]);
}

describe('custom autolinks', () => {
  it('links a Jira key anywhere in the message', () => {
    expect(links('ABCD-123: fix login, see ABCD-7', [JIRA], null)).toEqual([
      ['ABCD-123', 'https://jira.example.com/browse/ABCD-123'],
      ['ABCD-7', 'https://jira.example.com/browse/ABCD-7'],
    ]);
  });

  it('links a key inside a branch name of a merge subject', () => {
    expect(links("Merge branch 'feature/ABCD-12-login'", [JIRA], null)).toEqual([
      ['ABCD-12', 'https://jira.example.com/browse/ABCD-12'],
    ]);
  });

  it('needs a word boundary on both sides', () => {
    expect(links('XABCD-1 ABCD-1x ABCD-', [JIRA], null)).toEqual([]);
  });

  it('is case-sensitive unless ignoreCase is set', () => {
    expect(links('abcd-5', [JIRA], null)).toEqual([]);
    expect(links('abcd-5', [{ ...JIRA, ignoreCase: true }], null)).toEqual([
      ['abcd-5', 'https://jira.example.com/browse/ABCD-5'],
    ]);
  });

  it('matches letters after the prefix only when alphanumeric is set', () => {
    expect(links('ABCD-x9', [JIRA], null)).toEqual([]);
    expect(links('ABCD-x9', [{ ...JIRA, alphanumeric: true }], null)).toEqual([
      ['ABCD-x9', 'https://jira.example.com/browse/ABCD-x9'],
    ]);
  });

  it('treats regex characters in a prefix literally', () => {
    const rule = { prefix: 'T.(', url: 'https://t.example/<num>' };
    expect(links('T.(4 TX(4', [rule], null)).toEqual([['T.(4', 'https://t.example/4']]);
  });

  it('skips invalid entries instead of linking them', () => {
    expect(buildAutolinkRules([{ prefix: 'ABCD-', url: 'command:x<num>' }], null)).toBe(EMPTY_AUTOLINK_RULES);
  });

  it('does not link inside a URL already in the message', () => {
    expect(links('see https://jira.example.com/browse/ABCD-9 now', [JIRA], null)).toEqual([]);
  });
});

describe('GitHub autolinks', () => {
  it('links #N and GH-N to the issue URL, which also serves pull requests', () => {
    expect(links('Fix crash (#205), GH-7', [], GITHUB)).toEqual([
      ['#205', 'https://github.com/acme/widgets/issues/205'],
      ['GH-7', 'https://github.com/acme/widgets/issues/7'],
    ]);
  });

  it('links a cross-repository reference to that repository', () => {
    expect(links('Port of other-org/tool#12', [], GITHUB)).toEqual([
      ['other-org/tool#12', 'https://github.com/other-org/tool/issues/12'],
    ]);
  });

  it.each([
    ['an HTML entity', '&#123;'],
    ['a word with a hash', 'abc#12'],
    ['a trailing word', '#12abc'],
    ['issue zero', '#0'],
    ['a leading zero', '#012'],
    ['a doubled hash', '##3'],
    ['a URL fragment', 'https://example.com/page#3'],
    ['a GitLab merge request', '!3'],
  ])('ignores %s', (_label, text) => {
    expect(links(text, [], GITHUB)).toEqual([]);
  });
});

describe('GitLab autolinks', () => {
  it('links #N to an issue and !N to a merge request', () => {
    expect(links('Fixes #4, see !9', [], GITLAB)).toEqual([
      ['#4', 'https://gitlab.com/group/sub/app/-/issues/4'],
      ['!9', 'https://gitlab.com/group/sub/app/-/merge_requests/9'],
    ]);
  });

  it('links a cross-project reference with nested groups', () => {
    expect(links('From other/deep/lib!3', [], GITLAB)).toEqual([
      ['other/deep/lib!3', 'https://gitlab.com/other/deep/lib/-/merge_requests/3'],
    ]);
  });

  it('does not use GitHub-only syntax', () => {
    expect(links('GH-4', [], GITLAB)).toEqual([]);
  });
});

describe('rule precedence', () => {
  it('lets a custom rule win over a remote reference on the same text', () => {
    const azure = { prefix: '#', url: 'https://dev.azure.example/_workitems/edit/<num>' };
    expect(links('Fixes #42', [azure], GITHUB)).toEqual([
      ['#42', 'https://dev.azure.example/_workitems/edit/42'],
    ]);
  });

  it('never overlaps two links', () => {
    expect(links('acme/widgets#3', [], GITHUB)).toEqual([
      ['acme/widgets#3', 'https://github.com/acme/widgets/issues/3'],
    ]);
  });
});

describe('splitAutolinkSegments', () => {
  it('cuts text into plain and linked runs', () => {
    expect(splitAutolinkSegments('ABCD-1 done (#2)', buildAutolinkRules([JIRA], GITHUB))).toEqual([
      { text: 'ABCD-1', link: { url: 'https://jira.example.com/browse/ABCD-1', source: 'custom' } },
      { text: ' done (' },
      { text: '#2', link: { url: 'https://github.com/acme/widgets/issues/2', source: 'github' } },
      { text: ')' },
    ]);
  });

  it('returns one plain segment when nothing links', () => {
    expect(splitAutolinkSegments('plain', EMPTY_AUTOLINK_RULES)).toEqual([{ text: 'plain' }]);
  });
});

describe('getAutolinkRules', () => {
  const remotes: RemoteInfo[] = [{ name: 'origin', fetchUrl: 'git@github.com:acme/widgets.git', pushUrl: '' }];

  it('returns the same array for the same inputs, so row memos hold', () => {
    const custom = [JIRA];
    expect(getAutolinkRules(custom, true, remotes)).toBe(getAutolinkRules(custom, true, remotes));
  });

  it('keeps the same array when an equal remote list arrives under a new identity', () => {
    const custom = [JIRA];
    const rules = getAutolinkRules(custom, true, remotes);
    expect(getAutolinkRules(custom, true, remotes.map((remote) => ({ ...remote })))).toBe(rules);
  });

  it('rebuilds when what the rules link changes', () => {
    const rules = getAutolinkRules([JIRA], true, remotes);
    expect(getAutolinkRules([{ ...JIRA, prefix: 'XY-' }], true, remotes)).not.toBe(rules);
    const fork = [{ ...remotes[0], fetchUrl: 'git@github.com:acme/other.git' }];
    expect(findAutolinks('#1', getAutolinkRules([JIRA], true, fork)).map((match) => match.url))
      .toEqual(['https://github.com/acme/other/issues/1']);
  });

  it('adds no remote rules when the setting is off', () => {
    const rules = getAutolinkRules([], false, remotes);
    expect(findAutolinks('#1', rules)).toEqual([]);
  });

  it('adds the remote rules when the setting is on', () => {
    const rules = getAutolinkRules([], true, remotes);
    expect(findAutolinks('#1', rules).map((match) => match.url)).toEqual(['https://github.com/acme/widgets/issues/1']);
  });
});
