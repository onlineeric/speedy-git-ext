import type { MouseEvent, ReactNode } from 'react';
import { isEventFromPortal } from '../utils/portalEvents';

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

function stopClickFromPortal(event: MouseEvent) {
  if (isEventFromPortal(event)) event.stopPropagation();
}

/**
 * Wraps a context menu whose trigger sits **inside** a commit row (a ref badge,
 * the author or date cell), so the menu behaves like the row's own menu:
 *
 * - the right-click opens this menu, not the row's;
 * - a click inside the menu, or inside a dialog it opens, does not reach the
 *   row. Those render in portals, and React bubbles portal events to their React
 *   ancestors, so without this every menu action also selected the row and
 *   opened the details panel (GH #225).
 *
 * A click on the trigger itself still bubbles, so clicking a badge selects its
 * row like clicking anywhere else on it.
 */
export function NestedMenuBoundary({ children }: { children: ReactNode }) {
  return (
    <span onContextMenu={stopPropagation} onClick={stopClickFromPortal}>
      {children}
    </span>
  );
}
