import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { InputDialog } from './InputDialog';

interface CommitContextMenuProps {
  commit: Commit;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

export function CommitContextMenu({ commit, children }: CommitContextMenuProps) {
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);

  const handleCopyHash = () => {
    rpcClient.copyToClipboard(commit.hash);
  };

  const handleCopyShortHash = () => {
    rpcClient.copyToClipboard(commit.abbreviatedHash);
  };

  const handleCopyMessage = () => {
    rpcClient.copyToClipboard(commit.subject);
  };

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[180px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateBranchOpen(true)}>
              Create Branch Here...
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateTagOpen(true)}>
              Create Tag Here...
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
            <ContextMenu.Item className={menuItemClass} onSelect={handleCopyHash}>
              Copy Commit Hash
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={handleCopyShortHash}>
              Copy Short Hash
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
            <ContextMenu.Item className={menuItemClass} onSelect={handleCopyMessage}>
              Copy Commit Message
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <InputDialog
        open={createBranchOpen}
        onSubmit={(name) => {
          setCreateBranchOpen(false);
          rpcClient.createBranch(name, commit.hash);
        }}
        onCancel={() => setCreateBranchOpen(false)}
        title="Create Branch"
        label="Branch name"
        placeholder="feature/my-branch"
        validate={(v) => v.startsWith('-') ? 'Branch name cannot start with -' : undefined}
      />

      <InputDialog
        open={createTagOpen}
        onSubmit={(name) => {
          setCreateTagOpen(false);
          rpcClient.createTag(name, commit.hash);
        }}
        onCancel={() => setCreateTagOpen(false)}
        title="Create Tag"
        label="Tag name"
        placeholder="v1.0.0"
        validate={(v) => v.startsWith('-') ? 'Tag name cannot start with -' : undefined}
      />
    </>
  );
}
