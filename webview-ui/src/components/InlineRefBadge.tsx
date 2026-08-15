import type { ReactNode } from 'react';
import { useFirstLaneBadgeStyle } from '../stores/graphSelectors';
import { REF_BADGE_BASE_CLASS } from '../utils/refStyle';

/**
 * A ref badge holding only an icon, for naming a glyph inside a run of prose.
 *
 * Built from the same chrome and lane color as a real badge in the graph, so a
 * sentence about "the cloud" shows the thing the reader will actually be looking
 * for — not a bare glyph that has to be mentally dressed up as a badge first.
 *
 * `align-text-bottom` keeps it on the text baseline so the line height does not
 * jump; the icon inherits the badge's contrast-picked text color via
 * `currentColor`, exactly as it does inside `RefLabel`.
 */
export function InlineRefBadge({ children }: { children: ReactNode }) {
  const { laneColorStyle } = useFirstLaneBadgeStyle();

  return (
    <span className={`${REF_BADGE_BASE_CLASS} border align-text-bottom`} style={laneColorStyle}>
      {children}
    </span>
  );
}
