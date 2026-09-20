/**
 * "Split Editor Right" on a graph — recognising the empty editor group it leaves.
 *
 * A webview editor cannot be duplicated, so VS Code answers a split of one by
 * opening an editor group with nothing in it. There is no API for "the user
 * split this editor", so the split is recognised from its aftermath: a group
 * that opened EMPTY while the group the user was working in had a graph as its
 * active tab. That one rule covers every way of asking for the split — the
 * editor title button, `Ctrl+\`, split down, and split left — because each of
 * them ends the same way.
 *
 * Pure on purpose: the caller supplies snapshots, so the decision is testable
 * without an editor.
 */

/** The `viewType` passed to `createWebviewPanel` for a graph. */
export const GRAPH_WEBVIEW_VIEW_TYPE = 'speedyGit';

export interface EditorGroupSnapshot {
  viewColumn: number;
  tabCount: number;
  /** The group's active tab's `viewType` when that tab is a webview, else null. */
  activeWebviewViewType: string | null;
}

/**
 * VS Code reports an extension panel's tab `viewType` namespaced
 * (`mainThreadWebview-speedyGit`), and that prefix is not part of the API
 * contract — so match the suffix rather than the whole string.
 */
export function isGraphWebviewViewType(viewType: string | null | undefined): boolean {
  if (!viewType) return false;
  return viewType === GRAPH_WEBVIEW_VIEW_TYPE || viewType.endsWith(`-${GRAPH_WEBVIEW_VIEW_TYPE}`);
}

/**
 * The group a freshly opened split should be filled with a graph, or null when
 * this group change was not a graph being split.
 *
 * `source` is the group that was active *before* the change: by the time the
 * event arrives the new group already holds the focus, so the caller has to
 * have remembered it.
 */
export function pickSplitFillGroup<T extends EditorGroupSnapshot>(
  opened: readonly T[],
  source: EditorGroupSnapshot | undefined,
): T | null {
  if (!source || !isGraphWebviewViewType(source.activeWebviewViewType)) return null;
  const emptied = opened.find(
    (group) => group.tabCount === 0 && group.viewColumn !== source.viewColumn,
  );
  return emptied ?? null;
}
