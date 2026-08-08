import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import { buildDropStashCommand } from '../utils/gitCommandBuilder';
import { ConfirmDialog } from './ConfirmDialog';
import { LazyContextMenu } from './LazyContextMenu';
import { MenuGroupSeparator } from './MenuGroupSeparator';
import { MenuItem } from './MenuItem';
import { MenuContent } from './MenuContent';

interface StashContextMenuProps {
  commit: Commit;
  stashIndex: number;
  children: React.ReactNode;
}

// FR-017 (042-compare-refs): stash compare is intentionally out of scope for v1.
// Do NOT add "Set as Compare Base" / "Compare with Base" / "Compare these commits" items here.
// Stashes are not selectable in compare slot dropdowns either; this exclusion is enforced
// across all compare entry points.

export function StashContextMenu({ commit, stashIndex, children }: StashContextMenuProps) {
  return (
    <LazyContextMenu body={<StashContextMenuBody commit={commit} stashIndex={stashIndex} />}>
      {children}
    </LazyContextMenu>
  );
}

function StashContextMenuBody({ commit, stashIndex }: Omit<StashContextMenuProps, 'children'>) {
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false);
  const isValidIndex = stashIndex >= 0;

  const handleApply = () => {
    trackUiInteraction('stashMenu', 'applyStash');
    rpcClient.applyStash(stashIndex);
  };

  const handlePop = () => {
    trackUiInteraction('stashMenu', 'popStash');
    rpcClient.popStash(stashIndex);
  };

  const handleDrop = () => {
    trackUiInteraction('stashMenu', 'dropStash');
    if (isValidIndex) setDropConfirmOpen(true);
  };

  const handleCopyHash = () => {
    trackUiInteraction('stashMenu', 'copyHash');
    rpcClient.copyToClipboard(commit.hash);
  };

  return (
    <>
      <ContextMenu.Portal>
        <MenuContent minWidth="min-w-[160px]">
            <MenuItem onSelect={handleApply} disabled={!isValidIndex}>
              Apply Stash
            </MenuItem>
            <MenuItem onSelect={handlePop} disabled={!isValidIndex}>
              Pop Stash
            </MenuItem>
            <MenuItem danger onSelect={handleDrop} disabled={!isValidIndex}>
              Drop Stash
            </MenuItem>
            <MenuGroupSeparator />
            <MenuItem onSelect={handleCopyHash}>Copy Commit Hash</MenuItem>
          </MenuContent>
        </ContextMenu.Portal>

      <ConfirmDialog
        open={dropConfirmOpen}
        onConfirm={() => {
          setDropConfirmOpen(false);
          rpcClient.dropStash(stashIndex);
        }}
        onCancel={() => setDropConfirmOpen(false)}
        title="Drop Stash"
        description={`Are you sure you want to drop stash@{${stashIndex}}? This cannot be undone.`}
        telemetryId="dropStash"
        confirmLabel="Drop"
        variant="danger"
        commandPreview={buildDropStashCommand({ stashIndex })}
      />
    </>
  );
}
