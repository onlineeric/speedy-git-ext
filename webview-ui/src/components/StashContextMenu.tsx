import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { ConfirmDialog } from './ConfirmDialog';

interface StashContextMenuProps {
  commit: Commit;
  stashIndex: number;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';
const dangerItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-errorForeground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

export function StashContextMenu({ commit, stashIndex, children }: StashContextMenuProps) {
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false);

  const handleApply = () => {
    rpcClient.applyStash(stashIndex);
  };

  const handlePop = () => {
    rpcClient.popStash(stashIndex);
  };

  const handleDrop = () => {
    setDropConfirmOpen(true);
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
            <ContextMenu.Item className={menuItemClass} onSelect={handleApply}>
              Apply Stash
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={handlePop}>
              Pop Stash
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
            <ContextMenu.Item className={dangerItemClass} onSelect={handleDrop}>
              Drop Stash
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
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
      />
    </>
  );
}
