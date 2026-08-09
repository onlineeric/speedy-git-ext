import * as Popover from '@radix-ui/react-popover';
import type { Commit, TagMetadata, WorktreeInfo } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';
import { BranchContextMenu } from './BranchContextMenu';
import { RefLabel } from './RefLabel';
import { displayRefToRefInfo, displayRefKey } from '../utils/mergeRefs';
import { worktreeForDisplayRef } from '../utils/worktreeDisplay';
import { ACCENT_COLOR, tint } from '../utils/themeColors';

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
}

export function OverflowRefsBadge({ hiddenRefs, commit, laneColorStyle, worktreeByBranch, tagMetadata }: OverflowRefsBadgeProps) {
  if (hiddenRefs.length === 0) return null;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <span
          className="px-1.5 py-0.5 text-xs rounded border cursor-pointer font-medium hover:opacity-80"
          style={laneColorStyle ?? OVERFLOW_BADGE_FALLBACK_STYLE}
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
              />
            </BranchContextMenu>
          ))}
          <Popover.Arrow className="fill-[var(--vscode-menu-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
