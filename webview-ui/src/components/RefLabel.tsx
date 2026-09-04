import { forwardRef, type ReactNode } from 'react';
import type { TagMetadata, WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';
import { getRefBadgeContent, getRefTitle, remoteCountLabel, type RefBadgeIcon } from '../utils/refBadgeContent';
import { refContentSearchMatchKind } from '../utils/searchHighlight';
import { getRefStyle, REF_BADGE_BASE_CLASS } from '../utils/refStyle';
import { worktreeBadgeBorderColor } from '../utils/worktreeBadgeStyle';
import { BranchIcon, CloudIcon, TagIcon, WorktreeIcon } from './icons';
import { HighlightedText, SEARCH_MATCH_RING_STYLE } from './HighlightedText';
import { EMPTY_SEARCH_TERMS, type SearchTerm } from '../utils/searchQuery';

interface RefLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  displayRef: DisplayRef;
  laneColorStyle?: React.CSSProperties;
  worktree?: WorktreeInfo;
  /** Cached annotation metadata for a tag badge; enriches the native title tooltip (048). */
  tagMeta?: TagMetadata;
  /** Search terms to box inside the label text. */
  searchTerms?: readonly SearchTerm[];
}

/** Renders a single ref badge with an icon and label text. */
export const RefLabel = forwardRef<HTMLSpanElement, RefLabelProps>(
  function RefLabel({ displayRef, laneColorStyle, worktree, tagMeta, searchTerms = EMPTY_SEARCH_TERMS, className, style, ...rest }, ref) {
    const layoutStyle = getRefStyle(displayRef.type);
    const content = getRefBadgeContent(displayRef);
    const { label, leadIcons, remoteCount } = content;
    const title = getRefTitle(displayRef, worktree, tagMeta);
    const showWorktreeIcon = !!worktree && (displayRef.type === 'local-branch' || displayRef.type === 'merged-branch');
    // Derived here rather than passed in: the ring is a pure function of the content
    // and terms this badge already has, so every call site gets it without knowing
    // the rule — and a new one cannot forget to.
    const searchRing = refContentSearchMatchKind(content, searchTerms) === 'hidden';

    const fallbackColor = !laneColorStyle ? ' border-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]' : '';
    const baseStyle = laneColorStyle ? { ...style, ...laneColorStyle } : style;
    const badgeStyle = showWorktreeIcon || searchRing
      ? {
          ...baseStyle,
          ...(showWorktreeIcon && { borderColor: worktreeBadgeBorderColor(baseStyle?.borderColor) }),
          ...(searchRing && { boxShadow: SEARCH_MATCH_RING_STYLE.boxShadow }),
        }
      : baseStyle;
    const borderClass = showWorktreeIcon ? 'border' : layoutStyle;

    return (
      <span
        ref={ref}
        className={`${REF_BADGE_BASE_CLASS} ${borderClass}${fallbackColor}${className ? ` ${className}` : ''}`}
        title={title}
        {...rest}
        style={badgeStyle}
      >
        {leadIcons.length > 0 && (
          // Tighter than the badge's own gap so a fork+cloud pair reads as one sigil, not two icons.
          <span className="inline-flex shrink-0 items-center gap-px">
            {leadIcons.map((icon) => (
              <LeadIcon key={icon} icon={icon} />
            ))}
            {/* Only 2+ remotes need the count — one remote is what a cloud already implies. */}
            {remoteCount > 1 && <span className="text-[10px] leading-none">{remoteCount}</span>}
          </span>
        )}
        <HighlightedText text={label} terms={searchTerms} />
        {remoteCount > 0 && <span className="sr-only">{remoteCountLabel(remoteCount)}</span>}
        {showWorktreeIcon && <WorktreeIcon className="ml-0.5 h-3 w-3 shrink-0" />}
      </span>
    );
  }
);

function LeadIcon({ icon }: { icon: RefBadgeIcon }): ReactNode {
  switch (icon) {
    case 'branch':
      return <BranchIcon />;
    case 'cloud':
      return <CloudIcon />;
    case 'tag':
      return <TagIcon />;
  }
}
