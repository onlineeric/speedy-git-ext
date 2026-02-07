import { memo } from 'react';
import type { Commit } from '@shared/types';
import { type GraphTopology, getPassingLanes } from '../utils/graphTopology';

interface GraphCellProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  width: number;
  height: number;
}

const LANE_WIDTH = 16;
const NODE_RADIUS = 4;

const COLORS = [
  '#4ec9b0', // teal
  '#ce9178', // orange
  '#9cdcfe', // light blue
  '#c586c0', // purple
  '#dcdcaa', // yellow
  '#4fc1ff', // cyan
  '#d16969', // red
  '#b5cea8', // green
];

function getColor(colorIndex: number): string {
  return COLORS[colorIndex % COLORS.length];
}

function getLaneX(lane: number): number {
  return LANE_WIDTH / 2 + lane * LANE_WIDTH;
}

export const GraphCell = memo(function GraphCell({
  commit,
  commits,
  index,
  topology,
  width,
  height,
}: GraphCellProps) {
  const node = topology.nodes.get(commit.hash);

  if (!node) {
    return (
      <svg width={width} height={height} className="relative z-[1] flex-shrink-0">
        <circle cx={LANE_WIDTH / 2} cy={height / 2} r={NODE_RADIUS} fill="#888" />
      </svg>
    );
  }

  const nodeX = getLaneX(node.lane);
  const nodeY = height / 2;
  const color = getColor(node.colorIndex);
  const hasMerge = commit.parents.length > 1;

  // Get lanes that pass through this row
  const passingLanes = getPassingLanes(index, commits, topology);

  return (
    <svg width={width} height={height} className="relative z-[1] flex-shrink-0">
      {/* 1. Draw passing-through vertical lines */}
      {passingLanes.map((pl) => (
        <line
          key={`pass-${pl.lane}`}
          x1={getLaneX(pl.lane)}
          y1={0}
          x2={getLaneX(pl.lane)}
          y2={height}
          stroke={getColor(pl.colorIndex)}
          strokeWidth={2}
        />
      ))}

      {/* 2. Draw incoming connections (from merge commits above connecting to this commit) */}
      {node.incomingConnections.map((incoming, idx) => {
        const fromX = getLaneX(incoming.fromLane);
        const toX = nodeX;
        const incomingColor = getColor(incoming.colorIndex);

        if (incoming.fromLane === node.lane) {
          // Same lane - straight line from top to node
          return (
            <line
              key={`incoming-${idx}`}
              x1={toX}
              y1={0}
              x2={toX}
              y2={nodeY - NODE_RADIUS}
              stroke={incomingColor}
              strokeWidth={2}
            />
          );
        } else {
          // Different lane - diagonal from top corner to node
          return (
            <path
              key={`incoming-${idx}`}
              d={`M ${fromX} 0 Q ${fromX} ${nodeY * 0.5} ${toX} ${nodeY - NODE_RADIUS}`}
              stroke={incomingColor}
              strokeWidth={2}
              fill="none"
            />
          );
        }
      })}

      {/* 3. Draw line from top to node on this commit's lane (if has same-lane children above) */}
      {node.hasConnectionFromAbove && node.incomingConnections.length === 0 && (
        <line
          x1={nodeX}
          y1={0}
          x2={nodeX}
          y2={nodeY - NODE_RADIUS}
          stroke={color}
          strokeWidth={2}
        />
      )}

      {/* 4. Draw connections to parents */}
      {node.parentConnections.map((conn, idx) => {
        const fromX = getLaneX(conn.fromLane);
        const toX = getLaneX(conn.toLane);
        const connColor = getColor(conn.colorIndex);

        if (conn.fromLane === conn.toLane) {
          // Same lane - straight line down
          return (
            <line
              key={`parent-${idx}`}
              x1={fromX}
              y1={nodeY + NODE_RADIUS}
              x2={toX}
              y2={height}
              stroke={connColor}
              strokeWidth={2}
            />
          );
        } else {
          // Different lane - curve from node to target lane
          const midY = nodeY + NODE_RADIUS + 4;
          return (
            <path
              key={`parent-${idx}`}
              d={`M ${fromX} ${nodeY + NODE_RADIUS} L ${fromX} ${midY} Q ${fromX} ${height * 0.75} ${toX} ${height}`}
              stroke={connColor}
              strokeWidth={2}
              fill="none"
            />
          );
        }
      })}

      {/* 5. Draw the commit node circle */}
      <circle
        cx={nodeX}
        cy={nodeY}
        r={NODE_RADIUS}
        fill={hasMerge ? 'transparent' : color}
        stroke={color}
        strokeWidth={2}
      />
    </svg>
  );
});
