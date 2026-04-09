import * as ContextMenu from '@radix-ui/react-context-menu';
import { rpcClient } from '../rpc/rpcClient';

interface UncommittedContextMenuProps {
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

export function UncommittedContextMenu({ children }: UncommittedContextMenuProps) {
  const handleRefresh = () => {
    rpcClient.refresh();
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[160px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
          <ContextMenu.Item className={menuItemClass} onSelect={handleRefresh}>
            Refresh
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
