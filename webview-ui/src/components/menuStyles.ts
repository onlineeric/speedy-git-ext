/**
 * Shared Tailwind class strings for Radix context-menu items.
 *
 * Every context menu (Commit, Branch, Stash, Author, Date, Uncommitted, Worktree)
 * renders the same item / disabled-item / danger-item / separator styling, so the
 * tokens live here once instead of being re-declared in each menu component.
 */
export const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

/**
 * Item that opens a submenu. Same shape as `menuItemClass` plus room for the
 * trailing chevron, and it stays highlighted while its submenu is open so the
 * path you came through is obvious. Use via `MenuSubTrigger`, which supplies
 * the chevron — a submenu item must never look like a plain command.
 */
export const menuSubTriggerClass =
  'flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)] data-[state=open]:bg-[var(--vscode-menu-selectionBackground)] data-[state=open]:text-[var(--vscode-menu-selectionForeground)]';

export const menuItemDisabledClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-disabledForeground)] cursor-not-allowed outline-none';

export const dangerItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-errorForeground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

/**
 * Plain group divider. 1px rule + 5px margins = an 11px row, matching the
 * labelled variant below so a menu that mixes both keeps an even rhythm.
 */
export const menuSeparatorClass = 'h-px my-[5px] bg-[var(--vscode-menu-separatorBackground)]';

/**
 * Labelled group divider: `[rule] [label] [rule]`. Height and line-height are
 * pinned so the row measures the same 11px as `menuSeparatorClass` — naming a
 * group must not make the menu taller.
 */
export const menuGroupSeparatorClass = 'flex items-center gap-[9px] my-0 h-[11px] px-3';

export const menuGroupRuleClass = 'h-px flex-1 bg-[var(--vscode-menu-separatorBackground)]';

/**
 * The group name itself: small, uppercased, tracked out, and deliberately kept
 * at description-foreground contrast so it reads as structure and never
 * competes with the commands. The chip fill is mixed from the menu foreground
 * rather than hardcoded, so it stays subtle in light and dark themes alike.
 */
export const menuGroupLabelClass =
  'px-[5px] rounded-sm text-[10px] uppercase leading-[11px] tracking-[0.11em] whitespace-nowrap text-[var(--vscode-descriptionForeground)] bg-[color-mix(in_srgb,var(--vscode-menu-foreground)_8%,transparent)]';

/**
 * Shell styling for `ContextMenu.Content` / `ContextMenu.SubContent`. The
 * per-menu `min-w-[…]` is prepended at the call site; everything else (padding,
 * rounding, shadow, theme background/border, z-index) is shared.
 */
export const menuContentClass =
  'py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50';
