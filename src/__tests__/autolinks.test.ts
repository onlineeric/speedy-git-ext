import { describe, expect, it } from 'vitest';
import {
  isHttpUrl,
  normalizeCustomAutolinks,
  validateCustomAutolink,
  validateCustomAutolinks,
} from '../../shared/autolinks.js';

const JIRA = { prefix: 'ABCD-', url: 'https://jira.example.com/browse/ABCD-<num>' };

describe('isHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isHttpUrl('https://github.com/a/b')).toBe(true);
    expect(isHttpUrl('http://jira.local/browse/X-1')).toBe(true);
  });

  it('refuses every other scheme and anything unparseable', () => {
    expect(isHttpUrl('command:workbench.action.openSettings')).toBe(false);
    expect(isHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('jira.example.com/browse/1')).toBe(false);
  });
});

describe('normalizeCustomAutolinks', () => {
  it('returns an empty list for a non-array setting', () => {
    expect(normalizeCustomAutolinks(undefined)).toEqual([]);
    expect(normalizeCustomAutolinks({ prefix: 'A-' })).toEqual([]);
  });

  it('keeps well-shaped entries and only true options', () => {
    expect(normalizeCustomAutolinks([
      { ...JIRA, ignoreCase: true, alphanumeric: 'yes', title: 'ignored' },
    ])).toEqual([{ ...JIRA, ignoreCase: true }]);
  });

  it('drops entries without string prefix and url', () => {
    expect(normalizeCustomAutolinks([null, 'ABCD-', { prefix: 'A-' }, { prefix: 1, url: 'x' }, JIRA])).toEqual([JIRA]);
  });

  it('trims both fields, so a hand-edited entry matches the way validation reads it', () => {
    expect(normalizeCustomAutolinks([{ prefix: ' ABCD- ', url: ` ${JIRA.url} ` }])).toEqual([JIRA]);
  });

  it('keeps a well-shaped but invalid entry so the editor can show it', () => {
    expect(normalizeCustomAutolinks([{ prefix: '', url: 'nope' }])).toEqual([{ prefix: '', url: 'nope' }]);
  });
});

describe('validateCustomAutolink', () => {
  it('accepts a Jira-style entry', () => {
    expect(validateCustomAutolink(JIRA)).toEqual({});
  });

  it('requires a prefix without spaces', () => {
    expect(validateCustomAutolink({ ...JIRA, prefix: '  ' }).prefix).toBeDefined();
    expect(validateCustomAutolink({ ...JIRA, prefix: 'AB CD-' }).prefix).toBeDefined();
  });

  it('requires a URL containing <num>', () => {
    expect(validateCustomAutolink({ ...JIRA, url: '' }).url).toBe('Enter a URL');
    expect(validateCustomAutolink({ ...JIRA, url: 'https://jira.example.com/browse/' }).url).toContain('<num>');
  });

  it('requires an http(s) URL', () => {
    expect(validateCustomAutolink({ ...JIRA, url: 'command:foo?<num>' }).url).toContain('http');
    expect(validateCustomAutolink({ ...JIRA, url: 'jira.example.com/<num>' }).url).toContain('http');
  });
});

describe('validateCustomAutolinks', () => {
  it('reports a repeated prefix on the repeat, not the first', () => {
    const errors = validateCustomAutolinks([JIRA, { ...JIRA, prefix: ' ABCD- ' }]);
    expect(errors[0]).toEqual({});
    expect(errors[1].prefix).toBeDefined();
  });
});
