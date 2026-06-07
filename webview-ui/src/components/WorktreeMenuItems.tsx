import { useCallback, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { WorktreeInfo } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { WORKTREE_FOLDER_MISSING_TOOLTIP, worktreeFolderName } from '../utils/worktreeDisplay';
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog';
import { dangerItemClass, menuItemClass, menuItemDisabledClass, menuSeparatorClass } from './menuStyles';

export function useRemoveWorktreeDialog() {
  const [removeTarget, setRemoveTarget] = useState<WorktreeInfo | null>(null);
  const openRemoveWorktreeDialog = useCallback((worktree: WorktreeInfo) => {
    setRemoveTarget(worktree);
  }, []);

  const removeWorktreeDialog = removeTarget ? (
    <RemoveWorktreeDialog
      open
      worktree={removeTarget}
      onClose={() => setRemoveTarget(null)}
    />
  ) : null;

  return { openRemoveWorktreeDialog, removeWorktreeDialog };
}

export function WorktreeMenuItems({
  worktree,
  onRemove,
}: {
  worktree: WorktreeInfo;
  onRemove: (worktree: WorktreeInfo) => void;
}) {
  const openDisabled = worktree.isPrunable;
  const removeDisabled = worktree.isCurrent;

  return (
    <>
      <ContextMenu.Item
        className={openDisabled ? menuItemDisabledClass : menuItemClass}
        disabled={openDisabled}
        title={openDisabled ? WORKTREE_FOLDER_MISSING_TOOLTIP : worktree.path}
        onSelect={() => rpcClient.openWorktree(worktree.path)}
      >
        Open Worktree in New Window
      </ContextMenu.Item>
      <ContextMenu.Item
        className={removeDisabled ? menuItemDisabledClass : dangerItemClass}
        disabled={removeDisabled}
        title={removeDisabled ? 'The current worktree cannot be removed.' : worktree.path}
        onSelect={() => onRemove(worktree)}
      >
        Remove Worktree…
      </ContextMenu.Item>
    </>
  );
}

export function WorktreeMenuGroup({
  worktrees,
  onRemove,
}: {
  worktrees: WorktreeInfo[];
  onRemove: (worktree: WorktreeInfo) => void;
}) {
  if (worktrees.length === 1) {
    return <WorktreeMenuItems worktree={worktrees[0]} onRemove={onRemove} />;
  }

  return (
    <>
      {worktrees.map((worktree, index) => (
        <div key={worktree.path}>
          {index > 0 && <ContextMenu.Separator className={menuSeparatorClass} />}
          <ContextMenu.Label className="px-3 py-1 text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="font-mono">{worktreeFolderName(worktree.path)}</span>
            <span className="block max-w-64 truncate" title={worktree.path}>{worktree.path}</span>
          </ContextMenu.Label>
          <WorktreeMenuItems worktree={worktree} onRemove={onRemove} />
        </div>
      ))}
    </>
  );
}
