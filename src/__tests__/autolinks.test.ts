import { describe, expect, it } from 'vitest';
import {
  customAutolinkIgnoresCase,
  isHttpUrl,
  normalizeCustomAutolinks,
  parseAutolinkPrefix,
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

  it('keeps well-shaped entries and only non-default options', () => {
    expect(normalizeCustomAutolinks([
      { ...JIRA, ignoreCase: true, alphanumeric: 'yes', title: 'ignored' },
      { ...JIRA, ignoreCase: false, alphanumeric: true },
    ])).toEqual([JIRA, { ...JIRA, ignoreCase: false, alphanumeric: true }]);
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

  it('requires a prefix, and quotes around one with spaces', () => {
    expect(validateCustomAutolink({ ...JIRA, prefix: '  ' }).prefix).toBeDefined();
    expect(validateCustomAutolink({ ...JIRA, prefix: 'AB CD-' }).prefix).toContain('double quotes');
  });

  it('accepts a quoted prefix with spaces', () => {
    expect(validateCustomAutolink({ ...JIRA, prefix: '"Jira "' }).prefix).toBeUndefined();
    expect(validateCustomAutolink({ ...JIRA, prefix: '"Jira Ticket "' }).prefix).toBeUndefined();
  });

  it('rejects a quoted prefix with nothing in it, or with tabs or newlines', () => {
    expect(validateCustomAutolink({ ...JIRA, prefix: '""' }).prefix).toBeDefined();
    expect(validateCustomAutolink({ ...JIRA, prefix: '"   "' }).prefix).toBeDefined();
    expect(validateCustomAutolink({ ...JIRA, prefix: '"Jira\t"' }).prefix).toBeDefined();
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

describe('parseAutolinkPrefix', () => {
  it('leaves an unquoted prefix as typed, trimmed', () => {
    expect(parseAutolinkPrefix(' ABCD- ')).toEqual({ text: 'ABCD-', quoted: false });
  });

  it('keeps the spaces inside quotes', () => {
    expect(parseAutolinkPrefix('"Jira "')).toEqual({ text: 'Jira ', quoted: true });
    expect(parseAutolinkPrefix('  " Jira "  ')).toEqual({ text: ' Jira ', quoted: true });
  });

  it('reads \\" as a literal quote inside quotes', () => {
    expect(parseAutolinkPrefix('"say \\"hi\\" "')).toEqual({ text: 'say "hi" ', quoted: true });
    expect(parseAutolinkPrefix('"\\""')).toEqual({ text: '"', quoted: true });
  });

  it('treats an unpaired or escaped closing quote as part of an unquoted prefix', () => {
    expect(parseAutolinkPrefix('"')).toEqual({ text: '"', quoted: false });
    expect(parseAutolinkPrefix('"Jira')).toEqual({ text: '"Jira', quoted: false });
    expect(parseAutolinkPrefix('"Jira\\"')).toEqual({ text: '"Jira\\"', quoted: false });
  });
});

describe('validateCustomAutolinks', () => {
  it('reports a repeated prefix on the repeat, not the first', () => {
    const errors = validateCustomAutolinks([JIRA, { ...JIRA, prefix: ' ABCD- ' }]);
    expect(errors[0]).toEqual({});
    expect(errors[1].prefix).toBeDefined();
  });

  it('compares prefixes by what they match, quotes removed', () => {
    const errors = validateCustomAutolinks([JIRA, { ...JIRA, prefix: '"ABCD-"' }]);
    expect(errors[1].prefix).toBeDefined();
  });

  it('keeps "Jira" and "Jira " apart', () => {
    const errors = validateCustomAutolinks([{ ...JIRA, prefix: 'Jira' }, { ...JIRA, prefix: '"Jira "' }]);
    expect(errors).toEqual([{}, {}]);
  });
});

describe('customAutolinkIgnoresCase', () => {
  it('ignores case unless the entry opts out', () => {
    expect(customAutolinkIgnoresCase(JIRA)).toBe(true);
    expect(customAutolinkIgnoresCase({ ...JIRA, ignoreCase: true })).toBe(true);
    expect(customAutolinkIgnoresCase({ ...JIRA, ignoreCase: false })).toBe(false);
  });
});

describe('validateCustomAutolinks repeats by letter case', () => {
  const caseSensitive = (prefix: string) => ({ ...JIRA, prefix, ignoreCase: false });

  it('reports any casing of a prefix after one that ignores case', () => {
    expect(validateCustomAutolinks([JIRA, { ...JIRA, prefix: 'abcd-' }])[1].prefix).toBeDefined();
    expect(validateCustomAutolinks([JIRA, caseSensitive('Abcd-')])[1].prefix).toBeDefined();
  });

  it('allows other casings after a case-sensitive prefix, which still link something', () => {
    expect(validateCustomAutolinks([caseSensitive('ABCD-'), caseSensitive('abcd-')])[1]).toEqual({});
    expect(validateCustomAutolinks([caseSensitive('ABCD-'), { ...JIRA, prefix: 'abcd-' }])[1]).toEqual({});
  });

  it('still reports the exact same case-sensitive prefix', () => {
    expect(validateCustomAutolinks([caseSensitive('ABCD-'), caseSensitive('ABCD-')])[1].prefix).toBeDefined();
  });

  it('allows a case-insensitive entry after a case-sensitive one in any casing, since both link other casings', () => {
    expect(validateCustomAutolinks([caseSensitive('ABCD-'), JIRA])[1]).toEqual({});
  });
});
