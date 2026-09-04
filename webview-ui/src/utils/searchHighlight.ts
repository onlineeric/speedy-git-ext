import type { DisplayRef } from '../types/displayRefs';
import { getRefBadgeContent, type RefBadgeContent } from './refBadgeContent';
import { MIN_HASH_TERM_LENGTH } from './searchFilter';
import type { SearchTerm } from './searchQuery';

/**
 * Where a search term lands inside a piece of displayed text.
 *
 * With up to eight fields able to match, the row highlight alone no longer says
 * *why* a row matched — these segments are what puts a box around the characters
 * that did.
 */

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

/** Reused for the (overwhelmingly common) no-match case, so callers can skip wrapping entirely. */
function unmatchedOnly(text: string): HighlightSegment[] {
  return [{ text, matched: false }];
}

/**
 * Substring highlighting, for the subject, the author and ref labels — the same
 * rule the matcher uses for those fields.
 *
 * Overlapping **and adjacent** matches merge into one box: `ab` and `bc` over
 * `abc` must not render as two touching boxes with a seam down the middle.
 */
export function buildHighlightSegments(text: string, terms: readonly SearchTerm[]): HighlightSegment[] {
  if (terms.length === 0 || text.length === 0) return unmatchedOnly(text);

  const haystack = text.toLowerCase();
  const intervals: Array<[number, number]> = [];

  for (const { text: term } of terms) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(term, from);
      if (at === -1) break;
      intervals.push([at, at + term.length]);
      from = at + 1;
    }
  }

  if (intervals.length === 0) return unmatchedOnly(text);

  intervals.sort((a, b) => a[0] - b[0]);

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let [start, end] = intervals[0];

  const emit = (from: number, to: number) => {
    if (cursor < from) segments.push({ text: text.slice(cursor, from), matched: false });
    segments.push({ text: text.slice(from, to), matched: true });
    cursor = to;
  };

  for (let i = 1; i < intervals.length; i++) {
    const [nextStart, nextEnd] = intervals[i];
    if (nextStart <= end) {
      // Overlapping or adjacent — one box.
      end = Math.max(end, nextEnd);
      continue;
    }
    emit(start, end);
    [start, end] = [nextStart, nextEnd];
  }
  emit(start, end);

  if (cursor < text.length) segments.push({ text: text.slice(cursor), matched: false });
  return segments;
}

/**
 * Prefix-only highlighting, for the hash cell — mirroring the matcher's prefix
 * rule, so a term that cannot match a hash cannot box one either.
 *
 * The cell shows the *abbreviated* hash while the matcher also accepts a prefix of
 * the full one, so a term longer than what is displayed still belongs to it and
 * boxes the whole of it. Several qualifying terms take the longest range.
 */
export function buildPrefixHighlightSegments(text: string, terms: readonly SearchTerm[]): HighlightSegment[] {
  if (terms.length === 0 || text.length === 0) return unmatchedOnly(text);

  const haystack = text.toLowerCase();
  let longest = 0;
  for (const { text: term } of terms) {
    if (term.length < MIN_HASH_TERM_LENGTH) continue;
    if (!haystack.startsWith(term) && !term.startsWith(haystack)) continue;
    longest = Math.max(longest, Math.min(term.length, text.length));
  }

  if (longest === 0) return unmatchedOnly(text);
  if (longest >= text.length) return [{ text, matched: true }];
  return [
    { text: text.slice(0, longest), matched: true },
    { text: text.slice(longest), matched: false },
  ];
}

/** Whether a badge matched, and whether the matching text is on the badge or only behind it. */
export type RefSearchMatchKind = 'none' | 'label' | 'hidden';

/**
 * `'hidden'` is the merged-branch case: the badge shows `main` while the term hit
 * `origin/main`, which the badge never renders. Those get a ring around the whole
 * badge instead of an inline box, so the match is still visible.
 */
export function refSearchMatchKind(displayRef: DisplayRef, terms: readonly SearchTerm[]): RefSearchMatchKind {
  return refContentSearchMatchKind(getRefBadgeContent(displayRef), terms);
}

/**
 * The same answer for a caller that has already built the badge's content —
 * `RefLabel` renders from it, so making it re-derive the `DisplayRef` would cost
 * a second `getRefBadgeContent` per badge on every row of a virtualized scroll.
 */
export function refContentSearchMatchKind(content: RefBadgeContent, terms: readonly SearchTerm[]): RefSearchMatchKind {
  if (terms.length === 0) return 'none';

  const label = content.label.toLowerCase();
  if (terms.some(({ text }) => label.includes(text))) return 'label';

  const hidden = content.hiddenSearchTexts;
  if (hidden.length > 0) {
    const lowered = hidden.map((name) => name.toLowerCase());
    if (terms.some(({ text }) => lowered.some((name) => name.includes(text)))) return 'hidden';
  }

  return 'none';
}
