import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import { StashDialog } from './StashDialog';
import { DiscardAllDialog } from './DiscardAllDialog';
import { FilePickerDialog } from './FilePickerDialog';
import { CompareMenuItems } from './CompareMenuItems';
import { LazyContextMenu } from './LazyContextMenu';
import { MenuGroupSeparator } from './MenuGroupSeparator';
import { MenuItem } from './MenuItem';
import { MenuContent } from './MenuContent';

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
        <MenuContent>
            {/* The working-tree changes themselves, ordered from staging through to discarding. */}
            {hasUnstagedChanges && <MenuItem onSelect={handleStageAll}>Stage All Changes</MenuItem>}
            {hasStagedChanges && <MenuItem onSelect={handleUnstageAll}>Unstage All Changes</MenuItem>}
            {hasAnyChanges && (
              <MenuItem onSelect={() => { trackUiInteraction('uncommittedMenu', 'selectFiles'); setFilePickerOpen(true); }}>
                Select files for...
              </MenuItem>
            )}
            {hasAnyChanges && (
              <MenuItem onSelect={() => { trackUiInteraction('uncommittedMenu', 'stash'); setStashDialogOpen(true); }}>
                Stash Everything…
              </MenuItem>
            )}
            {hasUnstagedChanges && (
              <MenuItem danger onSelect={() => { trackUiInteraction('uncommittedMenu', 'discardAll'); setDiscardAllDialogOpen(true); }}>
                Discard All Unstaged Changes
              </MenuItem>
            )}

            {/* Compare-refs (042-compare-refs) — Working Tree sentinel. With a clean
               working tree there is no group above, so compare leads the menu unheaded. */}
            {hasAnyChanges && <MenuGroupSeparator label="Compare" />}
            <CompareMenuItems slot={{ kind: 'workingTree' }} surface="uncommittedMenu" />

            <MenuGroupSeparator />
            <MenuItem onSelect={handleRefresh}>Refresh</MenuItem>
          </MenuContent>
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
