import type { WorktreeFolderNameStyle } from '@shared/types';

/**
 * The Create Worktree dialog's nested-vs-flattened folder choice, as pure decisions.
 *
 * Two rules live here and nowhere else, because both are easy to restate slightly
 * differently at a second call site:
 *
 * - **At most one path holds manual edits: the selected one.** Leaving an option
 *   always restores it to its computed default, so there is never a hidden edit in
 *   the row you are not looking at — which is what the discard confirmation warns
 *   about, and why switching away and back gives you the default rather than your
 *   old text.
 * - **The "Use … by default" link is visible only when saving would change
 *   something** — the choice is shown *and* the selection differs from the
 *   configured style. Otherwise clicking it would appear to do nothing.
 */

export interface ResolvedWorktreePaths {
  nestedPath: string;
  flatPath: string;
  /** True when the derived folder name contains a separator, i.e. the choice applies. */
  hierarchical: boolean;
}

/** How each style is named in the dialog. */
export const WORKTREE_STYLE_LABELS: Record<WorktreeFolderNameStyle, string> = {
  nested: 'Nested path',
  flat: 'Flatten path',
};

/** The computed default for one style; empty while nothing has been resolved yet. */
export function computedPathFor(
  resolved: ResolvedWorktreePaths | null,
  style: WorktreeFolderNameStyle,
): string {
  if (!resolved) return '';
  return style === 'nested' ? resolved.nestedPath : resolved.flatPath;
}

/**
 * True when the box's text differs from what the backend computed for that style.
 *
 * Compared against the computed string rather than tracking keystrokes, so typing
 * something and deleting it again leaves nothing to discard.
 */
export function isPathEdited(current: string, computed: string): boolean {
  return current !== computed;
}

/**
 * What a click on a style radio should do: nothing (it is already selected), switch
 * immediately, or ask before discarding the edit in the box being left.
 */
export function decideStyleSwitch(args: {
  current: WorktreeFolderNameStyle;
  next: WorktreeFolderNameStyle;
  currentText: string;
  computed: string;
}): 'ignore' | 'switch' | 'confirm' {
  if (args.next === args.current) return 'ignore';
  return isPathEdited(args.currentText, args.computed) ? 'confirm' : 'switch';
}

/** Whether the "Use … by default" link is shown, and the text it carries. */
export function saveDefaultLink(args: {
  hierarchical: boolean;
  selected: WorktreeFolderNameStyle;
  configured: WorktreeFolderNameStyle;
}): { visible: boolean; label: string } {
  return {
    visible: args.hierarchical && args.selected !== args.configured,
    // Names the style, not the path: only the style is saved.
    label: `Use ${WORKTREE_STYLE_LABELS[args.selected]} by default`,
  };
}
