import { describe, it, expect } from 'vitest';
import type { DisplayRef } from '../../types/displayRefs';
import {
  buildHighlightSegments,
  buildPrefixHighlightSegments,
  refSearchMatchKind,
  type HighlightSegment,
} from '../searchHighlight';
import { parseSearchQuery } from '../searchQuery';

/** Compact rendering of segments: matched runs wrapped in brackets. */
function render(segments: HighlightSegment[]): string {
  return segments.map((segment) => (segment.matched ? `[${segment.text}]` : segment.text)).join('');
}

function highlight(text: string, query: string): string {
  return render(buildHighlightSegments(text, parseSearchQuery(query)));
}

function prefix(text: string, query: string): string {
  return render(buildPrefixHighlightSegments(text, parseSearchQuery(query)));
}

describe('buildHighlightSegments', () => {
  it('returns one unmatched segment when there are no terms', () => {
    expect(buildHighlightSegments('fix the bug', [])).toEqual([{ text: 'fix the bug', matched: false }]);
  });

  it('returns one unmatched segment when nothing matches', () => {
    const segments = buildHighlightSegments('fix the bug', parseSearchQuery('nope'));
    expect(segments).toEqual([{ text: 'fix the bug', matched: false }]);
  });

  it('splits a match in the middle into three segments', () => {
    expect(highlight('fix the bug', 'the')).toBe('fix [the] bug');
  });

  it('emits two segments for a match at the start', () => {
    expect(highlight('fix the bug', 'fix')).toBe('[fix] the bug');
  });

  it('emits two segments for a match at the end', () => {
    expect(highlight('fix the bug', 'bug')).toBe('fix the [bug]');
  });

  it('highlights every occurrence of a term', () => {
    expect(highlight('fix a fix', 'fix')).toBe('[fix] a [fix]');
  });

  it('merges overlapping terms into one box', () => {
    expect(highlight('abcd', 'abc bcd')).toBe('[abcd]');
  });

  it('merges adjacent terms into one box, with no seam', () => {
    expect(highlight('abc', 'ab bc')).toBe('[abc]');
  });

  it('preserves the original case of matched text', () => {
    expect(highlight('Fix The Bug', 'the')).toBe('Fix [The] Bug');
  });

  it('emits a single matched segment when the whole string matches', () => {
    expect(buildHighlightSegments('fix', parseSearchQuery('fix'))).toEqual([{ text: 'fix', matched: true }]);
  });

  it('returns the text untouched when it is empty', () => {
    expect(buildHighlightSegments('', parseSearchQuery('fix'))).toEqual([{ text: '', matched: false }]);
  });
});

describe('buildPrefixHighlightSegments', () => {
  it('boxes only the leading run for a term shorter than the text', () => {
    expect(prefix('a1b2c3d', 'a1b2')).toBe('[a1b2]c3d');
  });

  it('boxes the whole text for a term longer than it', () => {
    expect(prefix('a1b2c3d', 'a1b2c3d4e5')).toBe('[a1b2c3d]');
  });

  it('boxes nothing for a term under the hash floor', () => {
    expect(prefix('a1b2c3d', 'a1b')).toBe('a1b2c3d');
  });

  it('boxes nothing for a term that is not a prefix', () => {
    expect(prefix('a1b2c3d', 'b2c3')).toBe('a1b2c3d');
  });

  it('takes the longest of several qualifying terms', () => {
    expect(prefix('a1b2c3d', 'a1b2 a1b2c3')).toBe('[a1b2c3]d');
  });

  it('boxes nothing when there are no terms', () => {
    expect(buildPrefixHighlightSegments('a1b2c3d', [])).toEqual([{ text: 'a1b2c3d', matched: false }]);
  });
});

describe('refSearchMatchKind', () => {
  const local: DisplayRef = { type: 'local-branch', localName: 'feature/new-ui' };
  const remote: DisplayRef = { type: 'remote-branch', remoteName: 'origin/main' };
  const merged: DisplayRef = { type: 'merged-branch', localName: 'main', remoteNames: ['origin/main'] };
  const tagRef: DisplayRef = { type: 'tag', tagName: 'v1.2.0' };
  const stash: DisplayRef = { type: 'stash', stashRef: 'stash@{0}' };

  it('reports none when there are no terms', () => {
    expect(refSearchMatchKind(local, [])).toBe('none');
  });

  it('reports a label match for a local branch', () => {
    expect(refSearchMatchKind(local, parseSearchQuery('feature'))).toBe('label');
    expect(refSearchMatchKind(local, parseSearchQuery('nope'))).toBe('none');
  });

  it('reports a label match for a remote branch, qualified or bare', () => {
    expect(refSearchMatchKind(remote, parseSearchQuery('origin/main'))).toBe('label');
    expect(refSearchMatchKind(remote, parseSearchQuery('main'))).toBe('label');
  });

  it('reports a label match for a tag and a stash', () => {
    expect(refSearchMatchKind(tagRef, parseSearchQuery('v1.2'))).toBe('label');
    expect(refSearchMatchKind(stash, parseSearchQuery('stash@'))).toBe('label');
  });

  it('reports a hidden match when only a merged branch’s remote name matched', () => {
    // The badge shows `main`; `origin/` appears nowhere on it, so a ring is the only visible signal.
    expect(refSearchMatchKind(merged, parseSearchQuery('origin/'))).toBe('hidden');
  });

  it('prefers the label when a merged branch matches on both', () => {
    expect(refSearchMatchKind(merged, parseSearchQuery('main'))).toBe('label');
  });
});
