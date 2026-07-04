/**
 * SVG path builders for graph connection lines that change lanes.
 *
 * Each commit row is rendered as an isolated SVG cell, so any line crossing a
 * row boundary must do so perfectly vertically — otherwise it meets the
 * straight lane line of the adjacent row at an angle and shows a kink.
 *
 * These builders produce "rounded elbow" paths (the style used by GitKraken /
 * Fork): the line runs horizontally at node height, turns with a rounded
 * quarter-corner, and leaves the cell vertically. Lines meet the commit node
 * horizontally at its side instead of piling into its top/bottom point.
 */

/** Preferred radius of the rounded quarter-corner, in px. */
const CORNER_RADIUS = 8;

/**
 * Clamp the corner radius so the elbow always fits: it must leave room for a
 * horizontal segment up to the node edge and stay inside the cell vertically.
 */
function cornerRadius(horizontalSpan: number, verticalSpan: number, nodeRadius: number): number {
  return Math.max(2, Math.min(CORNER_RADIUS, horizontalSpan - nodeRadius, verticalSpan));
}

/**
 * Path for a connection arriving from a different lane above: drops vertically
 * from the cell top, turns with a rounded corner at node height, then runs
 * horizontally into the side of the commit node.
 */
export function curveIntoNodePath(
  fromX: number,
  nodeX: number,
  nodeY: number,
  nodeRadius: number
): string {
  const direction = Math.sign(nodeX - fromX);
  const radius = cornerRadius(Math.abs(nodeX - fromX), nodeY, nodeRadius);
  const cornerEndX = fromX + direction * radius;
  const nodeEdgeX = nodeX - direction * nodeRadius;
  return (
    `M ${fromX} 0 L ${fromX} ${nodeY - radius} ` +
    `Q ${fromX} ${nodeY} ${cornerEndX} ${nodeY} L ${nodeEdgeX} ${nodeY}`
  );
}

/**
 * Path for a merge connection leaving toward a different lane below: exits the
 * side of the commit node horizontally, turns down with a rounded corner at
 * the target lane, then drops vertically to the cell bottom.
 */
export function curveOutOfNodePath(
  nodeX: number,
  toX: number,
  nodeY: number,
  cellHeight: number,
  nodeRadius: number
): string {
  const direction = Math.sign(toX - nodeX);
  const radius = cornerRadius(Math.abs(toX - nodeX), cellHeight - nodeY, nodeRadius);
  const nodeEdgeX = nodeX + direction * nodeRadius;
  const cornerStartX = toX - direction * radius;
  return (
    `M ${nodeEdgeX} ${nodeY} L ${cornerStartX} ${nodeY} ` +
    `Q ${toX} ${nodeY} ${toX} ${nodeY + radius} L ${toX} ${cellHeight}`
  );
}
