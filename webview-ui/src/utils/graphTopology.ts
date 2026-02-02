import type { Commit } from '@shared/types';

/**
 * Graph topology calculation for git commit visualization.
 * Assigns lanes (x-positions) and colors to commits based on branch structure.
 */

export interface CommitNode {
  hash: string;
  lane: number;
  colorIndex: number;
  /** Connections to draw FROM this commit's row going DOWN to parent lanes */
  parentConnections: {
    parentHash: string;
    fromLane: number;
    toLane: number;
    colorIndex: number;
  }[];
  /** Connections coming INTO this commit from ABOVE (from child commits) */
  incomingConnections: {
    fromLane: number;
    colorIndex: number;
  }[];
}

export interface GraphTopology {
  nodes: Map<string, CommitNode>;
  maxLanes: number;
  /** Pre-computed passing lanes for each row index (O(1) lookup instead of O(n²)) */
  passingLanesByRow: Map<number, { lane: number; colorIndex: number }[]>;
  /** Hash to index map for O(1) lookups */
  commitIndexByHash: Map<string, number>;
}

/**
 * Calculate graph topology from commits.
 *
 * Algorithm processes commits top-to-bottom (newest first) and:
 * 1. Tracks which lane each commit should appear on
 * 2. When a merge has multiple parents, the first parent stays on same lane,
 *    other parents branch out to adjacent lanes
 * 3. Colors are assigned per lane for consistency
 * 4. Handles lane reuse when branches end
 */
export function calculateTopology(commits: Commit[]): GraphTopology {
  const nodes = new Map<string, CommitNode>();

  if (commits.length === 0) {
    return { nodes, maxLanes: 0, passingLanesByRow: new Map(), commitIndexByHash: new Map() };
  }

  // Build commit index for quick lookup
  const commitIndexByHash = new Map<string, number>();
  for (let i = 0; i < commits.length; i++) {
    commitIndexByHash.set(commits[i].hash, i);
  }

  // activeLanes[i] = hash of commit that should appear next on lane i, or null if lane is free
  const activeLanes: (string | null)[] = [];

  // Track which lane a hash is already reserved on (to handle multiple paths to same commit)
  const reservedLane = new Map<string, number>();

  // Color per lane
  const laneColors = new Map<number, number>();
  let nextColorIndex = 0;

  // Track incoming connections for each commit (from children above)
  const incomingConnections = new Map<string, { fromLane: number; colorIndex: number }[]>();

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const hash = commit.hash;

    // Find the lane this commit should be on
    let assignedLane = reservedLane.get(hash) ?? -1;

    if (assignedLane === -1) {
      // Not reserved, find in activeLanes
      for (let lane = 0; lane < activeLanes.length; lane++) {
        if (activeLanes[lane] === hash) {
          assignedLane = lane;
          break;
        }
      }
    }

    if (assignedLane === -1) {
      // Not found anywhere, assign to first available lane
      assignedLane = findAvailableLane(activeLanes);
      if (assignedLane === activeLanes.length) {
        activeLanes.push(null);
      }
    }

    // Clear this lane (commit is being placed here now)
    activeLanes[assignedLane] = null;
    reservedLane.delete(hash);

    // Assign color for this lane if not already assigned
    if (!laneColors.has(assignedLane)) {
      laneColors.set(assignedLane, nextColorIndex++);
    }

    const colorIndex = laneColors.get(assignedLane)!;
    const parentConnections: CommitNode['parentConnections'] = [];
    const parents = commit.parents;

    if (parents.length === 0) {
      // Root commit - lane stays free
    } else if (parents.length === 1) {
      // Single parent
      const parentHash = parents[0];
      const parentInCommits = commitIndexByHash.has(parentHash);

      if (parentInCommits) {
        const existingLane = reservedLane.get(parentHash);

        if (existingLane !== undefined && existingLane !== assignedLane) {
          // Parent already reserved on different lane - draw connection to that lane
          parentConnections.push({
            parentHash,
            fromLane: assignedLane,
            toLane: existingLane,
            colorIndex: laneColors.get(existingLane) ?? colorIndex,
          });
        } else {
          // Reserve parent on same lane
          activeLanes[assignedLane] = parentHash;
          reservedLane.set(parentHash, assignedLane);
          parentConnections.push({
            parentHash,
            fromLane: assignedLane,
            toLane: assignedLane,
            colorIndex,
          });
        }
      }
    } else {
      // Merge commit - multiple parents
      for (let p = 0; p < parents.length; p++) {
        const parentHash = parents[p];
        const parentInCommits = commitIndexByHash.has(parentHash);

        if (!parentInCommits) continue;

        const existingLane = reservedLane.get(parentHash);

        if (p === 0) {
          // First parent - prefer same lane
          if (existingLane !== undefined && existingLane !== assignedLane) {
            // Already reserved elsewhere, connect to that lane
            parentConnections.push({
              parentHash,
              fromLane: assignedLane,
              toLane: existingLane,
              colorIndex: laneColors.get(existingLane) ?? colorIndex,
            });
          } else {
            // Use same lane
            activeLanes[assignedLane] = parentHash;
            reservedLane.set(parentHash, assignedLane);
            parentConnections.push({
              parentHash,
              fromLane: assignedLane,
              toLane: assignedLane,
              colorIndex,
            });
          }
        } else {
          // Secondary parent - needs a branch lane
          if (existingLane !== undefined) {
            // Already reserved, connect to that lane
            const parentColor = laneColors.get(existingLane) ?? colorIndex;
            parentConnections.push({
              parentHash,
              fromLane: assignedLane,
              toLane: existingLane,
              colorIndex: parentColor,
            });
            // Record incoming connection for the parent commit (from the lane the line passes through)
            addIncomingConnection(incomingConnections, parentHash, existingLane, parentColor);
          } else {
            // Find adjacent lane for branch (prefer lane next to current)
            let branchLane = findAdjacentLane(activeLanes, assignedLane);
            if (branchLane === activeLanes.length) {
              activeLanes.push(null);
            }

            activeLanes[branchLane] = parentHash;
            reservedLane.set(parentHash, branchLane);

            // Assign color for branch lane
            if (!laneColors.has(branchLane)) {
              laneColors.set(branchLane, nextColorIndex++);
            }
            const branchColor = laneColors.get(branchLane)!;

            parentConnections.push({
              parentHash,
              fromLane: assignedLane,
              toLane: branchLane,
              colorIndex: branchColor,
            });
            // Record incoming connection for the parent commit (from the branch lane, not the merge commit's lane)
            addIncomingConnection(incomingConnections, parentHash, branchLane, branchColor);
          }
        }
      }
    }

    nodes.set(hash, {
      hash,
      lane: assignedLane,
      colorIndex,
      parentConnections,
      incomingConnections: incomingConnections.get(hash) || [],
    });
  }

  // Calculate max lanes
  let maxLanes = 1;
  for (const node of nodes.values()) {
    maxLanes = Math.max(maxLanes, node.lane + 1);
    for (const conn of node.parentConnections) {
      maxLanes = Math.max(maxLanes, conn.toLane + 1);
    }
  }

  // Pre-compute passing lanes for each row (O(n) instead of O(n²) at render time)
  const passingLanesByRow = computePassingLanes(commits, nodes, commitIndexByHash);

  return { nodes, maxLanes, passingLanesByRow, commitIndexByHash };
}

/**
 * Pre-compute passing lanes for all rows during topology calculation.
 * This avoids O(n²) complexity at render time.
 */
function computePassingLanes(
  commits: Commit[],
  nodes: Map<string, CommitNode>,
  commitIndexByHash: Map<string, number>
): Map<number, { lane: number; colorIndex: number }[]> {
  const passingLanesByRow = new Map<number, { lane: number; colorIndex: number }[]>();

  // Track active connections: Map<toLane, { colorIndex, endRowIndex }>
  // A connection is active from the row after the source commit until the parent row
  const activeConnections = new Map<number, { colorIndex: number; endRowIndex: number }[]>();

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const node = nodes.get(commit.hash);

    // Collect passing lanes for this row (exclude the current node's lane)
    const passingLanes: { lane: number; colorIndex: number }[] = [];
    const currentLane = node?.lane ?? -1;

    for (const [lane, connections] of activeConnections.entries()) {
      if (lane === currentLane) continue;

      // Check if any connection on this lane passes through this row
      for (const conn of connections) {
        if (i < conn.endRowIndex) {
          passingLanes.push({ lane, colorIndex: conn.colorIndex });
          break; // Only add lane once
        }
      }
    }

    passingLanesByRow.set(i, passingLanes);

    // Add new connections from this commit to activeConnections
    if (node) {
      for (const conn of node.parentConnections) {
        const parentIndex = commitIndexByHash.get(conn.parentHash);
        if (parentIndex !== undefined && parentIndex > i) {
          const laneConnections = activeConnections.get(conn.toLane) || [];
          laneConnections.push({ colorIndex: conn.colorIndex, endRowIndex: parentIndex });
          activeConnections.set(conn.toLane, laneConnections);
        }
      }
    }

    // Clean up completed connections
    for (const [lane, connections] of activeConnections.entries()) {
      const remaining = connections.filter(c => c.endRowIndex > i);
      if (remaining.length === 0) {
        activeConnections.delete(lane);
      } else {
        activeConnections.set(lane, remaining);
      }
    }
  }

  return passingLanesByRow;
}

function addIncomingConnection(
  map: Map<string, { fromLane: number; colorIndex: number }[]>,
  hash: string,
  fromLane: number,
  colorIndex: number
) {
  const existing = map.get(hash) || [];
  existing.push({ fromLane, colorIndex });
  map.set(hash, existing);
}

/**
 * Find first available (null) lane
 */
function findAvailableLane(lanes: (string | null)[]): number {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) {
      return i;
    }
  }
  return lanes.length;
}

/**
 * Find an available lane adjacent to the given lane (prefer lane+1, then lane-1, then any)
 */
function findAdjacentLane(lanes: (string | null)[], nearLane: number): number {
  // Prefer the lane immediately to the right
  const rightLane = nearLane + 1;
  if (rightLane >= lanes.length || lanes[rightLane] === null) {
    return rightLane;
  }

  // Try lane to the left (if valid and available)
  if (nearLane > 0 && lanes[nearLane - 1] === null) {
    return nearLane - 1;
  }

  // Find any available lane
  return findAvailableLane(lanes);
}

/**
 * Get lanes that pass through a row (branches continuing without a node on this row).
 * Uses pre-computed data for O(1) lookup instead of O(n²) computation.
 */
export function getPassingLanes(
  rowIndex: number,
  _commits: Commit[],
  topology: GraphTopology
): { lane: number; colorIndex: number }[] {
  // Use pre-computed passing lanes for O(1) lookup
  return topology.passingLanesByRow.get(rowIndex) || [];
}
