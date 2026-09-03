import * as Popover from '@radix-ui/react-popover';
import type { Commit, TagMetadata, WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';
import { BranchContextMenu } from './BranchContextMenu';
import { RefLabel } from './RefLabel';
import { displayRefToRefInfo, displayRefKey } from '../utils/mergeRefs';
import { worktreeForDisplayRef } from '../utils/worktreeDisplay';
import { ACCENT_COLOR, tint } from '../utils/themeColors';
import { REF_BADGE_BASE_CLASS } from '../utils/refStyle';
import { refSearchMatchKind } from '../utils/searchHighlight';
import { EMPTY_SEARCH_TERMS, type SearchTerm } from '../utils/searchQuery';
import { SEARCH_MATCH_RING_STYLE } from './HighlightedText';

/** Used when the row has no lane color to borrow — see `laneColorStyle`. */
const OVERFLOW_BADGE_FALLBACK_STYLE: React.CSSProperties = {
  borderColor: ACCENT_COLOR,
  color: ACCENT_COLOR,
  backgroundColor: tint(ACCENT_COLOR, 10),
};

interface OverflowRefsBadgeProps {
  hiddenRefs: DisplayRef[];
  /** The row's commit — badges in here get the same menu as badges on the row. */
  commit: Commit;
  laneColorStyle?: React.CSSProperties;
  worktreeByBranch?: Map<string, WorktreeInfo>;
  tagMetadata?: Record<string, TagMetadata>;
  /** Search terms; the +N trigger rings when a badge folded into it matched. */
  searchTerms?: readonly SearchTerm[];
}

export function OverflowRefsBadge({ hiddenRefs, commit, laneColorStyle, worktreeByBranch, tagMetadata, searchTerms = EMPTY_SEARCH_TERMS }: OverflowRefsBadgeProps) {
  if (hiddenRefs.length === 0) return null;

  // A match hidden behind the +N would otherwise be a row highlighted for no
  // visible reason — this is the badge's share of saying why.
  const hasSearchMatch = hiddenRefs.some((displayRef) => refSearchMatchKind(displayRef, searchTerms) !== 'none');
  const triggerStyle = laneColorStyle ?? OVERFLOW_BADGE_FALLBACK_STYLE;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <span
          className={`${REF_BADGE_BASE_CLASS} border cursor-pointer font-medium hover:opacity-80`}
          style={hasSearchMatch ? { ...triggerStyle, boxShadow: SEARCH_MATCH_RING_STYLE.boxShadow } : triggerStyle}
          onClick={(e) => e.stopPropagation()}
        >
          +{hiddenRefs.length}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="max-w-xs rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50 flex flex-wrap gap-1 p-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (
              target.closest('[data-radix-menu-content]') ||
              target.closest('[role="alertdialog"]') ||
              target.closest('[role="dialog"]')
            ) {
              e.preventDefault();
            }
          }}
        >
          {hiddenRefs.map((displayRef) => (
            <BranchContextMenu key={displayRefKey(displayRef)} refInfo={displayRefToRefInfo(displayRef)} commit={commit}>
              <RefLabel
                displayRef={displayRef}
                laneColorStyle={laneColorStyle}
                worktree={worktreeByBranch ? worktreeForDisplayRef(displayRef, worktreeByBranch) : undefined}
                tagMeta={displayRef.type === 'tag' ? tagMetadata?.[displayRef.tagName] : undefined}
                searchTerms={searchTerms}
                searchRing={refSearchMatchKind(displayRef, searchTerms) === 'hidden'}
              />
            </BranchContextMenu>
          ))}
          <Popover.Arrow className="fill-[var(--vscode-menu-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
