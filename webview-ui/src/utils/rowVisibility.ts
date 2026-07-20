/**
 * Computes the minimal scrollTop needed to bring a virtualized row fully into
 * the scroll container's viewport. Used when the bottom commit-details panel
 * opens and shrinks the graph viewport, potentially hiding the row the user
 * just clicked beneath the panel.
 */
export interface RowScrollArgs {
  /** Zero-based index of the row in the virtualized list */
  rowIndex: number;
  /** Fixed height of each row in pixels */
  rowHeight: number;
  /** Current scrollTop of the scroll container */
  scrollTop: number;
  /** Current visible height (clientHeight) of the scroll container */
  viewportHeight: number;
}

/**
 * Returns the new scrollTop that makes the row fully visible, or null when the
 * row is already fully visible (no scroll needed). Scrolls the minimal amount:
 * rows hidden below the viewport are aligned to its bottom edge, rows hidden
 * above are aligned to its top edge.
 */
export function computeScrollTopForRow({
  rowIndex,
  rowHeight,
  scrollTop,
  viewportHeight,
}: RowScrollArgs): number | null {
  if (rowIndex < 0 || rowHeight <= 0 || viewportHeight <= 0) return null;

  const rowTop = rowIndex * rowHeight;
  const rowBottom = rowTop + rowHeight;

  if (rowBottom > scrollTop + viewportHeight) {
    return rowBottom - viewportHeight;
  }
  if (rowTop < scrollTop) {
    return rowTop;
  }
  return null;
}
