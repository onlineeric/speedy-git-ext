import { describe, expect, it } from 'vitest';
import { buildAutolinkRules } from '../autolinks';
import { listMessageAutolinks } from '../inlineCodeRenderer';

const RULES = buildAutolinkRules([], { provider: 'github', webBaseUrl: 'https://github.com', repoPath: 'acme/widgets' });

describe('listMessageAutolinks', () => {
  it('lists the links the rendered message shows, in order, with their text', () => {
    expect(listMessageAutolinks('Fix #12 and GH-3', RULES)).toEqual([
      { label: '#12', url: 'https://github.com/acme/widgets/issues/12', source: 'github' },
      { label: 'GH-3', url: 'https://github.com/acme/widgets/issues/3', source: 'github' },
    ]);
  });

  it('never lists a reference inside inline code, which the message does not link', () => {
    expect(listMessageAutolinks('Parse `#12` before #13', RULES).map((link) => link.label)).toEqual(['#13']);
  });

  it('lists nothing without rules', () => {
    expect(listMessageAutolinks('Fix #12', [])).toEqual([]);
  });
});
