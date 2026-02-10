import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';

interface CommitContextMenuProps {
  commit: Commit;
  children: React.ReactNode;
}

export function CommitContextMenu({ commit, children }: CommitContextMenuProps) {
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
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[180px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
          <ContextMenu.Item
            className="px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onSelect={handleCopyHash}
          >
            Copy Commit Hash
          </ContextMenu.Item>
          <ContextMenu.Item
            className="px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onSelect={handleCopyShortHash}
          >
            Copy Short Hash
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
          <ContextMenu.Item
            className="px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onSelect={handleCopyMessage}
          >
            Copy Commit Message
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
