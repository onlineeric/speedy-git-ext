import type { MouseEvent, ReactNode } from 'react';

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * Wraps a context menu whose trigger sits **inside** a commit row (a ref badge,
 * the author or date cell), so the right-click opens this menu rather than the
 * row's. Clicks inside the menu or its dialogs reaching the row are handled once,
 * by `CommitTableRow` ignoring portal-originated clicks (GH #225).
 */
export function NestedMenuBoundary({ children }: { children: ReactNode }) {
  return <span onContextMenu={stopPropagation}>{children}</span>;
}
