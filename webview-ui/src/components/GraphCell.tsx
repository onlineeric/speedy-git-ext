import { memo } from 'react';
import type { Commit } from '@shared/types';
import { type GraphTopology, getPassingLanesAtRow } from '../utils/graphTopology';

interface GraphCellProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  width: number;
}

const CELL_HEIGHT = 40;
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
}: GraphCellProps) {
  const node = topology.nodes.get(commit.hash);

  if (!node) {
    // Fallback if topology not calculated
    return (
      <svg width={width} height={CELL_HEIGHT} className="flex-shrink-0">
        <circle cx={LANE_WIDTH / 2} cy={CELL_HEIGHT / 2} r={NODE_RADIUS} fill="#888" />
      </svg>
    );
  }

  const nodeX = getLaneX(node.lane);
  const nodeY = CELL_HEIGHT / 2;
  const color = getColor(node.colorIndex);
  const hasMerge = commit.parents.length > 1;

  // Get lanes that pass through this row (from commits above connecting to parents below)
  const passingLanes = getPassingLanesAtRow(index, commits, topology);

  return (
    <svg width={width} height={CELL_HEIGHT} className="flex-shrink-0">
      {/* Draw passing-through vertical lines (branches that don't have a node on this row) */}
      {passingLanes
        .filter((pl) => pl.lane !== node.lane) // Don't draw on our own lane
        .map((pl) => (
          <line
            key={`pass-${pl.lane}`}
            x1={getLaneX(pl.lane)}
            y1={0}
            x2={getLaneX(pl.lane)}
            y2={CELL_HEIGHT}
            stroke={getColor(pl.colorIndex)}
            strokeWidth={2}
          />
        ))}

      {/* Draw line from top to node (if not first commit) */}
      {index > 0 && (
        <line
          x1={nodeX}
          y1={0}
          x2={nodeX}
          y2={nodeY - NODE_RADIUS}
          stroke={color}
          strokeWidth={2}
        />
      )}

      {/* Draw connections to parents */}
      {node.parentLanes.map((parent, pIndex) => {
        const parentX = getLaneX(parent.lane);
        const parentColor = getColor(parent.colorIndex);

        if (parent.lane === node.lane) {
          // Straight down - same lane
          return (
            <line
              key={`parent-${pIndex}`}
              x1={nodeX}
              y1={nodeY + NODE_RADIUS}
              x2={nodeX}
              y2={CELL_HEIGHT}
              stroke={parentColor}
              strokeWidth={2}
            />
          );
        } else {
          // Diagonal/curved connection to different lane
          // Draw from node down, then curve to the parent lane
          const midY = nodeY + NODE_RADIUS + 8;
          return (
            <g key={`parent-${pIndex}`}>
              {/* Short vertical from node */}
              <line
                x1={nodeX}
                y1={nodeY + NODE_RADIUS}
                x2={nodeX}
                y2={midY}
                stroke={parentColor}
                strokeWidth={2}
              />
              {/* Diagonal to parent lane */}
              <line
                x1={nodeX}
                y1={midY}
                x2={parentX}
                y2={CELL_HEIGHT}
                stroke={parentColor}
                strokeWidth={2}
              />
            </g>
          );
        }
      })}

      {/* Draw the commit node circle */}
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
