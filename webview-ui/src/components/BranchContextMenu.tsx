import * as ContextMenu from '@radix-ui/react-context-menu';
import type { RefInfo } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';

interface BranchContextMenuProps {
  refInfo: RefInfo;
  children: React.ReactNode;
}

export function BranchContextMenu({ refInfo, children }: BranchContextMenuProps) {
  const displayName = refInfo.remote
    ? `${refInfo.remote}/${refInfo.name}`
    : refInfo.name;

  const handleCheckout = () => {
    rpcClient.checkoutBranch(refInfo.name, refInfo.remote);
  };

  const handleCopyName = () => {
    rpcClient.copyToClipboard(displayName);
  };

  // Only show context menu for branches (not tags)
  const isBranch = refInfo.type === 'branch' || refInfo.type === 'remote' || refInfo.type === 'head';

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[160px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
          {isBranch && (
            <ContextMenu.Item
              className="px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
              onSelect={handleCheckout}
            >
              Checkout {refInfo.name}
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            className="px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onSelect={handleCopyName}
          >
            Copy {refInfo.type === 'tag' ? 'Tag' : 'Branch'} Name
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
