import { memo } from 'react';
import type { Commit } from '@shared/types';

interface GraphCellProps {
  index: number;
  commit: Commit;
}

const CELL_WIDTH = 24;
const CELL_HEIGHT = 40;
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

export const GraphCell = memo(function GraphCell({ index, commit }: GraphCellProps) {
  const colorIndex = index % COLORS.length;
  const color = COLORS[colorIndex];
  const hasParents = commit.parents.length > 0;
  const hasMerge = commit.parents.length > 1;

  return (
    <svg
      width={CELL_WIDTH}
      height={CELL_HEIGHT}
      className="flex-shrink-0"
    >
      {/* Vertical line from top to node */}
      {index > 0 && (
        <line
          x1={CELL_WIDTH / 2}
          y1={0}
          x2={CELL_WIDTH / 2}
          y2={CELL_HEIGHT / 2 - NODE_RADIUS}
          stroke={color}
          strokeWidth={2}
        />
      )}

      {/* Vertical line from node to bottom */}
      {hasParents && (
        <line
          x1={CELL_WIDTH / 2}
          y1={CELL_HEIGHT / 2 + NODE_RADIUS}
          x2={CELL_WIDTH / 2}
          y2={CELL_HEIGHT}
          stroke={color}
          strokeWidth={2}
        />
      )}

      {/* Commit node */}
      <circle
        cx={CELL_WIDTH / 2}
        cy={CELL_HEIGHT / 2}
        r={NODE_RADIUS}
        fill={hasMerge ? 'transparent' : color}
        stroke={color}
        strokeWidth={2}
      />
    </svg>
  );
});
