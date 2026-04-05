import * as ContextMenu from '@radix-ui/react-context-menu';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';

interface DateContextMenuProps {
  /** Unix timestamp (milliseconds) */
  authorDate: number;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

/**
 * Context menu for date cells in the commit table.
 *
 * IMPORTANT: Same lazy-mount pattern as AuthorContextMenu — zero store
 * subscriptions at the wrapper level. See AuthorContextMenu.tsx for rationale.
 */
export function DateContextMenu({ authorDate, children }: DateContextMenuProps) {
  return (
    <span onContextMenu={(e) => e.stopPropagation()}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[180px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            <DateFilterMenuItems authorDate={authorDate} />
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </span>
  );
}

/** Convert a Unix timestamp (milliseconds) to YYYY-MM-DD in local time. */
function toLocalDateString(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Lazily mounted — only subscribes to the store when the menu is actually open. */
function DateFilterMenuItems({ authorDate }: { authorDate: number }) {
  const setFilters = useGraphStore((s) => s.setFilters);

  const datePortion = toLocalDateString(authorDate);

  const handleFilterFrom = () => {
    const afterDate = `${datePortion}T00:00:00`;
    setFilters({ afterDate });
    rpcClient.getCommits({ ...useGraphStore.getState().filters, afterDate });
  };

  const handleFilterTo = () => {
    const beforeDate = `${datePortion}T23:59:59`;
    setFilters({ beforeDate });
    rpcClient.getCommits({ ...useGraphStore.getState().filters, beforeDate });
  };

  return (
    <>
      <ContextMenu.Item className={menuItemClass} onSelect={handleFilterFrom}>
        Filter from this date
      </ContextMenu.Item>
      <ContextMenu.Item className={menuItemClass} onSelect={handleFilterTo}>
        Filter to this date
      </ContextMenu.Item>
    </>
  );
}
