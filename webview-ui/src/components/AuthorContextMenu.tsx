import * as ContextMenu from '@radix-ui/react-context-menu';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';

interface AuthorContextMenuProps {
  authorEmail: string;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

/**
 * Context menu for author cells in the commit table.
 *
 * IMPORTANT: This component intentionally has ZERO Zustand store subscriptions
 * at the wrapper level. It mounts once per visible row, so any store subscription
 * here would cause every row to re-render on filter changes (corrupting the graph).
 * Store access is deferred to AuthorFilterMenuItems inside ContextMenu.Content,
 * which Radix only mounts (via Portal) when the menu is open — one row at a time.
 */
export function AuthorContextMenu({ authorEmail, children }: AuthorContextMenuProps) {
  return (
    <span onContextMenu={(e) => e.stopPropagation()}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[180px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            <AuthorFilterMenuItems authorEmail={authorEmail} />
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </span>
  );
}

/** Lazily mounted — only subscribes to the store when the menu is actually open. */
function AuthorFilterMenuItems({ authorEmail }: { authorEmail: string }) {
  const filters = useGraphStore((s) => s.filters);
  const setFilters = useGraphStore((s) => s.setFilters);

  const isFiltered = filters.authors?.includes(authorEmail) ?? false;

  const handleToggle = () => {
    const current = useGraphStore.getState().filters.authors ?? [];
    let next: string[];
    if (isFiltered) {
      next = current.filter((e) => e !== authorEmail);
    } else {
      next = [...current, authorEmail];
    }
    const authors = next.length > 0 ? next : undefined;
    setFilters({ authors });
    rpcClient.getCommits({ ...useGraphStore.getState().filters, authors });
  };

  return (
    <ContextMenu.Item className={menuItemClass} onSelect={handleToggle}>
      {isFiltered ? 'Remove Author from filter' : 'Add Author to filter'}
    </ContextMenu.Item>
  );
}
