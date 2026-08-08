import * as ContextMenu from '@radix-ui/react-context-menu';
import { MenuSubTrigger } from './MenuSubTrigger';
import { MenuSubContent } from './MenuContent';

/**
 * The "Copy" submenu shared by the commit row menu and the ref badge menus.
 *
 * Clipboard actions are the tail of every menu and never the reason it was
 * opened, so they collapse to a single row and expand on demand. Badge menus
 * pass their ref-name item in alongside the commit's, so everything copyable
 * from that row lives behind one predictable entry.
 */
export function MenuCopySubmenu({ children }: { children: React.ReactNode }) {
  return (
    <ContextMenu.Sub>
      <MenuSubTrigger>Copy</MenuSubTrigger>
      <ContextMenu.Portal>
        <MenuSubContent minWidth="min-w-[180px]">
          {children}
        </MenuSubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}
