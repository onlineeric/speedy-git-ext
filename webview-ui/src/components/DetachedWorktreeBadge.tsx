import * as ContextMenu from '@radix-ui/react-context-menu';
import type { CSSProperties } from 'react';
import type { WorktreeInfo } from '@shared/types';
import { detachedWorktreeBadgeText } from '../utils/worktreeDisplay';
import { worktreeBadgeBorderColor } from '../utils/worktreeBadgeStyle';
import { WorktreeIcon } from './icons';
import { useRemoveWorktreeDialog, WorktreeMenuGroup } from './WorktreeMenuItems';

interface DetachedWorktreeBadgeProps {
  worktrees: WorktreeInfo[];
  laneColorStyle?: CSSProperties;
}

export function DetachedWorktreeBadge({ worktrees, laneColorStyle }: DetachedWorktreeBadgeProps) {
  const { openRemoveWorktreeDialog, removeWorktreeDialog } = useRemoveWorktreeDialog();

  if (worktrees.length === 0) return null;

  const label = detachedWorktreeBadgeText(worktrees);
  const title = worktrees.map((worktree) => worktree.path).join('\n');
  // borderColor is always set inline below, so only the text color needs a fallback.
  const fallbackColor = !laneColorStyle ? ' text-[var(--vscode-badge-foreground)]' : '';
  const badgeStyle = {
    ...laneColorStyle,
    borderColor: worktreeBadgeBorderColor(laneColorStyle?.borderColor),
  };

  return (
    <>
      <span onContextMenu={(event) => event.stopPropagation()}>
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <span
              className={`inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs${fallbackColor}`}
              title={title}
              style={badgeStyle}
            >
              <WorktreeIcon className="h-3 w-3 shrink-0" />
              <span>{label}</span>
            </span>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="min-w-[220px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
              <WorktreeMenuGroup worktrees={worktrees} onRemove={openRemoveWorktreeDialog} />
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </span>
      {removeWorktreeDialog}
    </>
  );
}
