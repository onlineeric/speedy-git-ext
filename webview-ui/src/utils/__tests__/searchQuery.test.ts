import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../searchQuery';

function texts(query: string): string[] {
  return parseSearchQuery(query).map((term) => term.text);
}

describe('parseSearchQuery', () => {
  it('returns no terms for an empty or whitespace-only query', () => {
    expect(parseSearchQuery('')).toEqual([]);
    expect(parseSearchQuery('   ')).toEqual([]);
  });

  it('returns one term for a single word', () => {
    expect(parseSearchQuery('fix')).toEqual([{ text: 'fix', quoted: false }]);
  });

  it('lower-cases every term', () => {
    expect(texts('John FIX')).toEqual(['john', 'fix']);
  });

  it('discards empty terms from runs of whitespace', () => {
    expect(texts('  a   b  ')).toEqual(['a', 'b']);
  });

  it('treats a quoted run as one literal term', () => {
    expect(parseSearchQuery('"john fix"')).toEqual([{ text: 'john fix', quoted: true }]);
  });

  it('treats an unterminated quote as literal from the quote onward', () => {
    // Keeps results stable while the user is mid-typing.
    expect(parseSearchQuery('"john fix')).toEqual([{ text: 'john fix', quoted: true }]);
  });

  it('returns no terms for a query of only quote characters', () => {
    expect(parseSearchQuery('"')).toEqual([]);
    expect(parseSearchQuery('""')).toEqual([]);
  });

  it('toggles quoting mid-term, shell-style', () => {
    expect(texts('foo"bar baz"')).toEqual(['foobar baz']);
  });

  it('deduplicates repeated terms', () => {
    expect(texts('fix fix')).toEqual(['fix']);
  });

  it('mixes bare and quoted terms', () => {
    expect(texts('a "b c" d')).toEqual(['a', 'b c', 'd']);
  });
});
