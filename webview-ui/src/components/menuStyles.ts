/**
 * Shared Tailwind class strings for Radix context-menu items.
 *
 * Every context menu (Commit, Branch, Stash, Author, Date, Uncommitted, Worktree)
 * renders the same item / disabled-item / danger-item / separator styling, so the
 * tokens live here once instead of being re-declared in each menu component.
 */
export const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

export const menuItemDisabledClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-disabledForeground)] cursor-not-allowed outline-none';

export const dangerItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-errorForeground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

export const menuSeparatorClass = 'h-px my-1 bg-[var(--vscode-menu-separatorBackground)]';

/**
 * Shell styling for `ContextMenu.Content` / `ContextMenu.SubContent`. The
 * per-menu `min-w-[…]` is prepended at the call site; everything else (padding,
 * rounding, shadow, theme background/border, z-index) is shared.
 */
export const menuContentClass =
  'py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50';
