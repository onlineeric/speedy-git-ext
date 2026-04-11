import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { StashDialog } from './StashDialog';
import { DiscardAllDialog } from './DiscardAllDialog';
import { FilePickerDialog } from './FilePickerDialog';

interface UncommittedContextMenuProps {
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

const separatorClass = 'my-1 h-px bg-[var(--vscode-menu-separatorBackground)]';

export function UncommittedContextMenu({ children }: UncommittedContextMenuProps) {
  const [stashDialogOpen, setStashDialogOpen] = useState(false);
  const [discardAllDialogOpen, setDiscardAllDialogOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const uncommittedCounts = useGraphStore((state) => state.uncommittedCounts);
  const uncommittedStagedFiles = useGraphStore((state) => state.uncommittedStagedFiles);
  const uncommittedUnstagedFiles = useGraphStore((state) => state.uncommittedUnstagedFiles);

  const hasStagedChanges = uncommittedStagedFiles.length > 0;
  const hasUnstagedChanges = uncommittedUnstagedFiles.length > 0;
  const hasAnyChanges = uncommittedCounts.stagedCount + uncommittedCounts.unstagedCount + uncommittedCounts.untrackedCount > 0;

  const handleRefresh = () => rpcClient.refresh();
  const handleStageAll = () => rpcClient.stageAll();
  const handleUnstageAll = () => rpcClient.unstageAll();

  const handleStashConfirm = (message?: string) => {
    rpcClient.stashWithMessage(message);
    setStashDialogOpen(false);
  };

  const handleDiscardAllConfirm = () => {
    rpcClient.discardAllUnstaged();
    setDiscardAllDialogOpen(false);
  };

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[200px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            {hasAnyChanges && (
              <ContextMenu.Item className={menuItemClass} onSelect={() => setStashDialogOpen(true)}>
                Stash All Changes
              </ContextMenu.Item>
            )}
            {hasUnstagedChanges && (
              <ContextMenu.Item className={menuItemClass} onSelect={handleStageAll}>
                Stage All Changes
              </ContextMenu.Item>
            )}
            {hasStagedChanges && (
              <ContextMenu.Item className={menuItemClass} onSelect={handleUnstageAll}>
                Unstage All Changes
              </ContextMenu.Item>
            )}
            {hasUnstagedChanges && (
              <ContextMenu.Item className={menuItemClass} onSelect={() => setDiscardAllDialogOpen(true)}>
                Discard All Unstaged Changes
              </ContextMenu.Item>
            )}
            {hasAnyChanges && (
              <>
                <ContextMenu.Separator className={separatorClass} />
                <ContextMenu.Item className={menuItemClass} onSelect={() => setFilePickerOpen(true)}>
                  Select files for...
                </ContextMenu.Item>
              </>
            )}
            <ContextMenu.Separator className={separatorClass} />
            <ContextMenu.Item className={menuItemClass} onSelect={handleRefresh}>
              Refresh
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <StashDialog
        open={stashDialogOpen}
        onOpenChange={setStashDialogOpen}
        onConfirm={handleStashConfirm}
      />
      <DiscardAllDialog
        open={discardAllDialogOpen}
        onOpenChange={setDiscardAllDialogOpen}
        onConfirm={handleDiscardAllConfirm}
      />
      <FilePickerDialog
        open={filePickerOpen}
        onOpenChange={setFilePickerOpen}
        stagedFiles={uncommittedStagedFiles}
        unstagedFiles={uncommittedUnstagedFiles}
      />
    </>
  );
}
