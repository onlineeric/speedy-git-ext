import { describe, it, expect } from 'vitest';
import { curveIntoNodePath, curveOutOfNodePath } from '../graphPaths';

// Example geometry mirroring GraphCell's current defaults: 16px lanes
// (centers 8, 24, 40, …), 28px rows (node at y 14), node radius 4.
// The builders are fully parameterized, so these are sample values,
// not a contract with GraphCell's constants.
const NODE_Y = 14;
const CELL_HEIGHT = 28;
const NODE_RADIUS = 4;

/** Extract all coordinate pairs from a path string, in order. */
function points(path: string): Array<[number, number]> {
  const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const result: Array<[number, number]> = [];
  for (let i = 0; i < nums.length; i += 2) {
    result.push([nums[i], nums[i + 1]]);
  }
  return result;
}

describe('curveIntoNodePath', () => {
  it('starts vertically at the cell top in the source lane', () => {
    const path = curveIntoNodePath(24, 8, NODE_Y, NODE_RADIUS);
    const [start, verticalEnd] = points(path);
    expect(start).toEqual([24, 0]);
    // First segment is a pure vertical drop (same x), so it joins the
    // straight lane line of the row above without a kink.
    expect(verticalEnd[0]).toBe(24);
    expect(verticalEnd[1]).toBeGreaterThan(0);
    expect(verticalEnd[1]).toBeLessThan(NODE_Y);
  });

  it('ends horizontally at the side of the node', () => {
    const path = curveIntoNodePath(24, 8, NODE_Y, NODE_RADIUS);
    const pts = points(path);
    const end = pts[pts.length - 1];
    const beforeEnd = pts[pts.length - 2];
    // Node at x=8, approached from the right → line stops at its right edge.
    expect(end).toEqual([8 + NODE_RADIUS, NODE_Y]);
    // Final segment is horizontal (same y), entering the node's side.
    expect(beforeEnd[1]).toBe(NODE_Y);
  });

  it('handles connections arriving from the left of the node', () => {
    const path = curveIntoNodePath(8, 40, NODE_Y, NODE_RADIUS);
    const pts = points(path);
    expect(pts[0]).toEqual([8, 0]);
    // Stops at the node's left edge.
    expect(pts[pts.length - 1]).toEqual([40 - NODE_RADIUS, NODE_Y]);
  });

  it('keeps the corner inside the cell for adjacent lanes and a large node', () => {
    // Adjacent lanes (16px apart) with the HEAD node radius (6): the corner
    // radius must shrink so the horizontal segment does not overshoot.
    const path = curveIntoNodePath(24, 8, NODE_Y, 6);
    const xs = points(path).map(([x]) => x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(8 + 6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(24);
  });
});

describe('curveOutOfNodePath', () => {
  it('starts horizontally at the side of the node', () => {
    const path = curveOutOfNodePath(8, 40, NODE_Y, CELL_HEIGHT, NODE_RADIUS);
    const [start, horizontalEnd] = points(path);
    // Target lane is to the right → line leaves the node's right edge.
    expect(start).toEqual([8 + NODE_RADIUS, NODE_Y]);
    expect(horizontalEnd[1]).toBe(NODE_Y);
  });

  it('ends vertically at the cell bottom in the target lane', () => {
    const path = curveOutOfNodePath(8, 40, NODE_Y, CELL_HEIGHT, NODE_RADIUS);
    const pts = points(path);
    const end = pts[pts.length - 1];
    const beforeEnd = pts[pts.length - 2];
    expect(end).toEqual([40, CELL_HEIGHT]);
    // Last segment is a pure vertical drop (same x), so it joins the straight
    // lane line of the row below without a kink.
    expect(beforeEnd[0]).toBe(40);
  });

  it('handles merges toward a lane on the left of the node', () => {
    const path = curveOutOfNodePath(40, 8, NODE_Y, CELL_HEIGHT, NODE_RADIUS);
    const pts = points(path);
    expect(pts[0]).toEqual([40 - NODE_RADIUS, NODE_Y]);
    expect(pts[pts.length - 1]).toEqual([8, CELL_HEIGHT]);
  });

  it('keeps the corner inside the cell for adjacent lanes and a large node', () => {
    const path = curveOutOfNodePath(8, 24, NODE_Y, CELL_HEIGHT, 6);
    const pts = points(path);
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(8 + 6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(24);
    expect(Math.max(...ys)).toBeLessThanOrEqual(CELL_HEIGHT);
  });
});
