import type { ReactNode } from 'react';
import { buildHighlightSegments, buildPrefixHighlightSegments } from '../utils/searchHighlight';
import type { SearchTerm } from '../utils/searchQuery';
import { SEARCH_MATCH_BORDER_COLOR, SEARCH_MATCH_SURFACE_COLOR } from '../utils/themeColors';

/**
 * The box drawn around search-matched characters.
 *
 * `box-shadow: inset` rather than `border`, so the box adds no width and cannot
 * reflow the text it wraps — which matters inside a truncating, virtualized row.
 */
export const SEARCH_MATCH_STYLE: React.CSSProperties = {
  backgroundColor: SEARCH_MATCH_SURFACE_COLOR,
  boxShadow: `inset 0 0 0 1px ${SEARCH_MATCH_BORDER_COLOR}`,
  borderRadius: '2px',
};

/**
 * A ring around a whole ref badge, for a badge that matched on text it does not
 * display (a merged branch hit through `origin/main`). Outer rather than inset, so
 * it does not consume the small badge's interior.
 */
export const SEARCH_MATCH_RING_STYLE: React.CSSProperties = {
  boxShadow: `0 0 0 2px ${SEARCH_MATCH_SURFACE_COLOR}`,
};

interface HighlightedTextProps {
  text: string;
  terms: readonly SearchTerm[];
  /** `'substring'` (default) everywhere; `'prefix'` for the hash cell, mirroring how a hash matches. */
  mode?: 'substring' | 'prefix';
}

/**
 * Renders `text` with each search match boxed. Returns the bare string when
 * nothing matched, so an unmatched cell keeps its single text node.
 *
 * The segments are wrapped in **one** span rather than returned as a list: a ref
 * badge is an `inline-flex` with a `gap`, so loose segments would each become a
 * flex item and the gap would open a visible space on either side of every
 * highlight — `abcdefg` searched for `cde` reading as `ab cde fg`.
 *
 * A `<span>` rather than `<mark>`: `<mark>` carries user-agent colors that would
 * fight the theme.
 */
export function HighlightedText({ text, terms, mode = 'substring' }: HighlightedTextProps): ReactNode {
  const segments = mode === 'prefix'
    ? buildPrefixHighlightSegments(text, terms)
    : buildHighlightSegments(text, terms);

  if (segments.length === 1 && !segments[0].matched) {
    return segments[0].text;
  }

  return (
    <span>
      {segments.map((segment, index) =>
        segment.matched ? (
          <span key={index} style={SEARCH_MATCH_STYLE}>{segment.text}</span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  );
}
