import * as ContextMenu from '@radix-ui/react-context-menu';
import { MenuSubTrigger } from './MenuSubTrigger';
import { MENU_COLLISION_PADDING, menuContentClass } from './menuStyles';

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
        <ContextMenu.SubContent className={`min-w-[180px] ${menuContentClass}`} collisionPadding={MENU_COLLISION_PADDING}>
          {children}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}
