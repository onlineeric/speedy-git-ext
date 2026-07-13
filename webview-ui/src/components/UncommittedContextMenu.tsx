import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import { StashDialog } from './StashDialog';
import { DiscardAllDialog } from './DiscardAllDialog';
import { FilePickerDialog } from './FilePickerDialog';
import { CompareMenuItems } from './CompareMenuItems';
import { menuContentClass, menuItemClass, menuSeparatorClass } from './menuStyles';
import { LazyContextMenu } from './LazyContextMenu';

interface UncommittedContextMenuProps {
  children: React.ReactNode;
}

export function UncommittedContextMenu({ children }: UncommittedContextMenuProps) {
  return <LazyContextMenu body={<UncommittedContextMenuBody />}>{children}</LazyContextMenu>;
}

function UncommittedContextMenuBody() {
  const [stashDialogOpen, setStashDialogOpen] = useState(false);
  const [discardAllDialogOpen, setDiscardAllDialogOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const uncommittedCounts = useGraphStore((state) => state.uncommittedCounts);
  const uncommittedStagedFiles = useGraphStore((state) => state.uncommittedStagedFiles);
  const uncommittedUnstagedFiles = useGraphStore((state) => state.uncommittedUnstagedFiles);

  const hasStagedChanges = uncommittedStagedFiles.length > 0;
  const hasUnstagedChanges = uncommittedUnstagedFiles.length > 0;
  const hasAnyChanges = uncommittedCounts.stagedCount + uncommittedCounts.unstagedCount + uncommittedCounts.untrackedCount > 0;

  const handleRefresh = () => {
    trackUiInteraction('uncommittedMenu', 'refresh');
    rpcClient.refresh();
  };
  const handleStageAll = () => {
    trackUiInteraction('uncommittedMenu', 'stageAll');
    rpcClient.stageAll();
  };
  const handleUnstageAll = () => {
    trackUiInteraction('uncommittedMenu', 'unstageAll');
    rpcClient.unstageAll();
  };

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
      <ContextMenu.Portal>
        <ContextMenu.Content className={`min-w-[200px] ${menuContentClass}`}>
            {/* Compare-refs (042-compare-refs) — Working Tree sentinel */}
            <CompareMenuItems slot={{ kind: 'workingTree' }} surface="uncommittedMenu" />
            <ContextMenu.Separator className={menuSeparatorClass} />
            {hasAnyChanges && (
              <ContextMenu.Item className={menuItemClass} onSelect={() => { trackUiInteraction('uncommittedMenu', 'stash'); setStashDialogOpen(true); }}>
                Stash Everything…
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
              <ContextMenu.Item className={menuItemClass} onSelect={() => { trackUiInteraction('uncommittedMenu', 'discardAll'); setDiscardAllDialogOpen(true); }}>
                Discard All Unstaged Changes
              </ContextMenu.Item>
            )}
            {hasAnyChanges && (
              <>
                <ContextMenu.Separator className={menuSeparatorClass} />
                <ContextMenu.Item className={menuItemClass} onSelect={() => { trackUiInteraction('uncommittedMenu', 'selectFiles'); setFilePickerOpen(true); }}>
                  Select files for...
                </ContextMenu.Item>
              </>
            )}
            <ContextMenu.Separator className={menuSeparatorClass} />
            <ContextMenu.Item className={menuItemClass} onSelect={handleRefresh}>
              Refresh
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      <StashDialog
        open={stashDialogOpen}
        onOpenChange={setStashDialogOpen}
        onConfirm={handleStashConfirm}
        title="Stash Everything"
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
