import type { Commit } from '@shared/types';

/**
 * Graph topology calculation for git commit visualization.
 * Assigns lanes (x-positions) and colors to commits based on branch structure.
 */

export interface CommitNode {
  hash: string;
  lane: number;
  colorIndex: number;
  parentLanes: { hash: string; lane: number; colorIndex: number }[];
}

export interface CommitConnection {
  fromHash: string;
  toHash: string;
  fromLane: number;
  toLane: number;
  colorIndex: number;
  type: 'straight' | 'merge' | 'branch';
}

export interface GraphTopology {
  nodes: Map<string, CommitNode>;
  maxLanes: number;
  connections: CommitConnection[];
}

/**
 * Calculate graph topology from commits.
 * Assigns lanes and colors based on parent-child relationships.
 *
 * Algorithm:
 * 1. Process commits from newest to oldest (as they come from git log)
 * 2. Track active lanes (lanes with ongoing branch lines)
 * 3. When a commit's lane is not yet assigned, give it the leftmost available lane
 * 4. When a commit has multiple parents (merge), parents get separate lanes
 * 5. Colors are assigned per lane - commits on same lane share color
 */
export function calculateTopology(commits: Commit[]): GraphTopology {
  const nodes = new Map<string, CommitNode>();
  const connections: CommitConnection[] = [];

  if (commits.length === 0) {
    return { nodes, maxLanes: 0, connections };
  }

  // Build commit index for quick lookup
  const commitIndexByHash = new Map<string, number>();
  for (let i = 0; i < commits.length; i++) {
    commitIndexByHash.set(commits[i].hash, i);
  }

  // Track active lanes: lane index -> hash of commit expected to continue on that lane
  const activeLanes: (string | null)[] = [];
  const laneColors = new Map<number, number>(); // lane -> colorIndex
  let nextColorIndex = 0;

  // Process commits from top (newest) to bottom (oldest)
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const hash = commit.hash;

    // Find if this commit was expected on a specific lane
    let assignedLane = -1;
    for (let lane = 0; lane < activeLanes.length; lane++) {
      if (activeLanes[lane] === hash) {
        assignedLane = lane;
        break;
      }
    }

    // If not found, assign to first available lane (or new lane)
    if (assignedLane === -1) {
      assignedLane = findAvailableLane(activeLanes);
      if (assignedLane === activeLanes.length) {
        activeLanes.push(null);
      }
      // New lane gets a new color
      if (!laneColors.has(assignedLane)) {
        laneColors.set(assignedLane, nextColorIndex++);
      }
    }

    const colorIndex = laneColors.get(assignedLane) ?? 0;

    // Determine parent lanes
    const parentLanes: { hash: string; lane: number; colorIndex: number }[] = [];
    const parents = commit.parents;

    if (parents.length === 0) {
      // Root commit - mark lane as ended
      activeLanes[assignedLane] = null;
    } else if (parents.length === 1) {
      // Single parent - continue on same lane
      const parentHash = parents[0];
      const parentInCommits = commitIndexByHash.has(parentHash);

      if (parentInCommits) {
        activeLanes[assignedLane] = parentHash;
        parentLanes.push({ hash: parentHash, lane: assignedLane, colorIndex });

        // Add connection
        connections.push({
          fromHash: hash,
          toHash: parentHash,
          fromLane: assignedLane,
          toLane: assignedLane,
          colorIndex,
          type: 'straight',
        });
      } else {
        // Parent not in visible commits, end the lane
        activeLanes[assignedLane] = null;
      }
    } else {
      // Merge commit - first parent continues on same lane, others get new/existing lanes
      for (let p = 0; p < parents.length; p++) {
        const parentHash = parents[p];
        const parentInCommits = commitIndexByHash.has(parentHash);

        if (!parentInCommits) continue;

        if (p === 0) {
          // First parent continues on same lane
          activeLanes[assignedLane] = parentHash;
          parentLanes.push({ hash: parentHash, lane: assignedLane, colorIndex });

          connections.push({
            fromHash: hash,
            toHash: parentHash,
            fromLane: assignedLane,
            toLane: assignedLane,
            colorIndex,
            type: 'straight',
          });
        } else {
          // Check if parent is already expected on another lane
          let parentLane = -1;
          for (let lane = 0; lane < activeLanes.length; lane++) {
            if (activeLanes[lane] === parentHash) {
              parentLane = lane;
              break;
            }
          }

          if (parentLane === -1) {
            // Parent not on any lane yet, assign new lane
            parentLane = findAvailableLane(activeLanes, assignedLane);
            if (parentLane === activeLanes.length) {
              activeLanes.push(null);
            }
            activeLanes[parentLane] = parentHash;

            // Assign new color for this branch
            if (!laneColors.has(parentLane)) {
              laneColors.set(parentLane, nextColorIndex++);
            }
          }

          const parentColorIndex = laneColors.get(parentLane) ?? 0;
          parentLanes.push({ hash: parentHash, lane: parentLane, colorIndex: parentColorIndex });

          connections.push({
            fromHash: hash,
            toHash: parentHash,
            fromLane: assignedLane,
            toLane: parentLane,
            colorIndex: parentColorIndex,
            type: 'merge',
          });
        }
      }
    }

    nodes.set(hash, {
      hash,
      lane: assignedLane,
      colorIndex,
      parentLanes,
    });
  }

  // Calculate max lanes used
  let maxLanes = 0;
  for (const node of nodes.values()) {
    maxLanes = Math.max(maxLanes, node.lane + 1);
    for (const parent of node.parentLanes) {
      maxLanes = Math.max(maxLanes, parent.lane + 1);
    }
  }

  return { nodes, maxLanes, connections };
}

/**
 * Find the first available (null) lane, or return the next index.
 * Optionally exclude a specific lane.
 */
function findAvailableLane(lanes: (string | null)[], exclude?: number): number {
  for (let i = 0; i < lanes.length; i++) {
    if (i !== exclude && lanes[i] === null) {
      return i;
    }
  }
  return lanes.length;
}

/**
 * Get active lanes at a specific row index.
 * Returns lane indices that have passing-through lines (not ending at this row).
 */
export function getPassingLanesAtRow(
  rowIndex: number,
  commits: Commit[],
  topology: GraphTopology
): { lane: number; colorIndex: number }[] {
  const passingLanes: { lane: number; colorIndex: number }[] = [];
  const seenLanes = new Set<number>();

  // Check all commits above this row
  for (let i = 0; i < rowIndex; i++) {
    const commit = commits[i];
    const node = topology.nodes.get(commit.hash);
    if (!node) continue;

    // Check each parent connection
    for (const parent of node.parentLanes) {
      const parentIndex = commits.findIndex((c) => c.hash === parent.hash);
      // If parent is below current row, this lane passes through
      if (parentIndex > rowIndex && !seenLanes.has(parent.lane)) {
        seenLanes.add(parent.lane);
        passingLanes.push({ lane: parent.lane, colorIndex: parent.colorIndex });
      }
    }
  }

  return passingLanes;
}
