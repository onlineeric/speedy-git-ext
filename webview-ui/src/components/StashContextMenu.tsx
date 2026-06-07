import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { buildDropStashCommand } from '../utils/gitCommandBuilder';
import { ConfirmDialog } from './ConfirmDialog';
import { dangerItemClass, menuItemClass, menuSeparatorClass } from './menuStyles';

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
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false);
  const isValidIndex = stashIndex >= 0;

  const handleApply = () => {
    rpcClient.applyStash(stashIndex);
  };

  const handlePop = () => {
    rpcClient.popStash(stashIndex);
  };

  const handleDrop = () => {
    if (isValidIndex) setDropConfirmOpen(true);
  };

  const handleCopyHash = () => {
    rpcClient.copyToClipboard(commit.hash);
  };

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            <ContextMenu.Item className={menuItemClass} onSelect={handleApply} disabled={!isValidIndex}>
              Apply Stash
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={handlePop} disabled={!isValidIndex}>
              Pop Stash
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />
            <ContextMenu.Item className={dangerItemClass} onSelect={handleDrop} disabled={!isValidIndex}>
              Drop Stash
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />
            <ContextMenu.Item className={menuItemClass} onSelect={handleCopyHash}>
              Copy Commit Hash
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <ConfirmDialog
        open={dropConfirmOpen}
        onConfirm={() => {
          setDropConfirmOpen(false);
          rpcClient.dropStash(stashIndex);
        }}
        onCancel={() => setDropConfirmOpen(false)}
        title="Drop Stash"
        description={`Are you sure you want to drop stash@{${stashIndex}}? This cannot be undone.`}
        confirmLabel="Drop"
        variant="danger"
        commandPreview={buildDropStashCommand({ stashIndex })}
      />
    </>
  );
}
