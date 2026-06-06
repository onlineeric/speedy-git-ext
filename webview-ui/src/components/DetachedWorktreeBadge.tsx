import * as ContextMenu from '@radix-ui/react-context-menu';
import type { WorktreeInfo } from '@shared/types';
import { detachedWorktreeBadgeText } from '../utils/worktreeDisplay';
import { WorktreeIcon } from './icons';
import { useRemoveWorktreeDialog, WorktreeMenuGroup } from './WorktreeMenuItems';

export function DetachedWorktreeBadge({ worktrees }: { worktrees: WorktreeInfo[] }) {
  const { openRemoveWorktreeDialog, removeWorktreeDialog } = useRemoveWorktreeDialog();

  if (worktrees.length === 0) return null;

  const label = detachedWorktreeBadgeText(worktrees);
  const title = worktrees.map((worktree) => worktree.path).join('\n');

  return (
    <>
      <span onContextMenu={(event) => event.stopPropagation()}>
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <span
              className="inline-flex items-center gap-0.5 rounded border border-[var(--vscode-badge-background)] px-1.5 py-0.5 text-xs text-[var(--vscode-badge-foreground)]"
              title={title}
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
