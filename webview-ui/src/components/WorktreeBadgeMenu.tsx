import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { WorktreeInfo } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { WorktreeIcon } from './icons';

/** Branch ref → display name; "detached" when there's no branch. */
function label(wt: WorktreeInfo): string {
  if (wt.isDetached || !wt.branch) return 'detached';
  return wt.branch.startsWith('refs/heads/') ? wt.branch.slice('refs/heads/'.length) : wt.branch;
}

/**
 * Graph-row badge for commits that are a worktree HEAD. Clicking it opens a
 * popover listing one "Open in new window" target per worktree at this commit
 * (multiple worktrees on one commit are all listed — research R7).
 */
export function WorktreeBadgeMenu({ worktrees }: { worktrees: WorktreeInfo[] }) {
  const [open, setOpen] = useState(false);
  if (worktrees.length === 0) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex flex-shrink-0 items-center gap-0.5 rounded bg-[var(--vscode-badge-background)] px-1 py-0 text-[10px] text-[var(--vscode-badge-foreground)] hover:opacity-90"
          title={`In ${worktrees.length} worktree${worktrees.length > 1 ? 's' : ''}`}
        >
          <WorktreeIcon className="h-3 w-3" />
          {worktrees.length > 1 && <span>{worktrees.length}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="min-w-[200px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50"
        >
          {worktrees.map((wt) => (
            <button
              key={wt.path}
              type="button"
              onClick={() => {
                setOpen(false);
                rpcClient.openWorktree(wt.path);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-[var(--vscode-menu-foreground)] outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            >
              <span className="font-mono">{label(wt)}</span>
              <span className="block truncate text-xs text-[var(--vscode-descriptionForeground)]" title={wt.path}>
                Open in new window — {wt.path}
              </span>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
