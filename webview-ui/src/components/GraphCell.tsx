import { memo } from 'react';
import type { Commit } from '@shared/types';
import { type GraphTopology, getPassingLanes, connectionContinuationLane } from '../utils/graphTopology';
import { getColor, resolvePalette } from '../utils/colorUtils';
import { curveIntoNodePath, curveOutOfNodePath } from '../utils/graphPaths';

interface GraphCellProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  width: number;
  height: number;
  graphColors: readonly string[];
  isHeadCommit?: boolean;
  onNodeMouseEnter?: (hash: string, rect: DOMRect) => void;
  onNodeMouseLeave?: () => void;
}

const LANE_WIDTH = 16;
const NODE_RADIUS = 4;
const HEAD_NODE_RADIUS = 6;

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
  graphColors,
  isHeadCommit = false,
  onNodeMouseEnter,
  onNodeMouseLeave,
}: GraphCellProps) {
  const node = topology.nodes.get(commit.hash);
  const palette = resolvePalette(graphColors);


  if (!node) {
    return (
      <svg width={width} height={height} className="relative z-[1] flex-shrink-0">
        <circle cx={LANE_WIDTH / 2} cy={height / 2} r={isHeadCommit ? HEAD_NODE_RADIUS : NODE_RADIUS} fill="#888" />
      </svg>
    );
  }

  const nodeX = getLaneX(node.lane);
  const nodeY = height / 2;
  const nodeRadius = isHeadCommit ? HEAD_NODE_RADIUS : NODE_RADIUS;
  const color = getColor(node.colorIndex, palette);
  const hasMerge = commit.parents.length > 1;
  const isUncommitted = commit.refs.some(r => r.type === 'uncommitted');
  const uncommittedColor = '#E8A317'; // amber accent distinct from lane colors

  // Get lanes that pass through this row
  const passingLanes = getPassingLanes(index, commits, topology);

  const hasIncomingFromOwnLane = node.incomingConnections.some(
    (incoming) => incoming.fromLane === node.lane
  );

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
          stroke={getColor(pl.colorIndex, palette)}
          strokeWidth={2}
          {...(pl.isDotted ? { strokeDasharray: '4 3', opacity: 0.7 } : {})}
        />
      ))}

      {/* 2. Draw incoming connections (from merge commits above connecting to this commit) */}
      {node.incomingConnections.map((incoming, idx) => {
        const fromX = getLaneX(incoming.fromLane);
        const toX = nodeX;
        const incomingColor = getColor(incoming.colorIndex, palette);
        const incomingDottedProps = incoming.isDotted ? { strokeDasharray: '4 3', opacity: 0.7 } : {};

        if (incoming.fromLane === node.lane) {
          // Same lane - straight line from top to node
          return (
            <line
              key={`incoming-${idx}`}
              x1={toX}
              y1={0}
              x2={toX}
              y2={nodeY - nodeRadius}
              stroke={incomingColor}
              strokeWidth={2}
              {...incomingDottedProps}
            />
          );
        } else {
          // Different lane - drop vertically, then rounded elbow into the node's side
          return (
            <path
              key={`incoming-${idx}`}
              d={curveIntoNodePath(fromX, toX, nodeY, nodeRadius)}
              stroke={incomingColor}
              strokeWidth={2}
              fill="none"
              {...incomingDottedProps}
            />
          );
        }
      })}

      {/* 3. Draw line from top to node on this commit's lane (if has same-lane children above) */}
      {node.hasConnectionFromAbove && !hasIncomingFromOwnLane && (
        <line
          x1={nodeX}
          y1={0}
          x2={nodeX}
          y2={nodeY - nodeRadius}
          stroke={color}
          strokeWidth={2}
        />
      )}

      {/* 4. Draw connections to parents */}
      {node.parentConnections.map((conn, idx) => {
        const fromX = getLaneX(conn.fromLane);
        const toX = getLaneX(conn.toLane);
        const connColor = isUncommitted ? uncommittedColor : getColor(conn.colorIndex, palette);
        const dottedProps = (conn.isDotted || isUncommitted) ? { strokeDasharray: '4 3', opacity: isUncommitted ? 0.9 : 0.7 } : {};
        const tooltip = conn.isDotted && conn.hiddenCount
          ? <title>{conn.hiddenCount} hidden commit{conn.hiddenCount !== 1 ? 's' : ''}</title>
          : null;

        if (conn.fromLane === conn.toLane) {
          // Same lane - straight line down
          return (
            <g key={`parent-${idx}`}>
              {tooltip}
              <line
                x1={fromX}
                y1={nodeY + nodeRadius}
                x2={toX}
                y2={height}
                stroke={connColor}
                strokeWidth={2}
                {...dottedProps}
              />
            </g>
          );
        } else {
          if (connectionContinuationLane(hasMerge, conn) === conn.fromLane) {
            // Branch-style connection: keep child row straight and let the parent row
            // render the split curve via incomingConnections (matches Git Graph style).
            return (
              <g key={`parent-${idx}`}>
                {tooltip}
                <line
                  x1={fromX}
                  y1={nodeY + nodeRadius}
                  x2={fromX}
                  y2={height}
                  stroke={connColor}
                  strokeWidth={2}
                  {...dottedProps}
                />
              </g>
            );
          }

          // Different lane - rounded elbow from the node's side down into the target lane
          return (
            <g key={`parent-${idx}`}>
              {tooltip}
              <path
                d={curveOutOfNodePath(fromX, toX, nodeY, height, nodeRadius)}
                stroke={connColor}
                strokeWidth={2}
                fill="none"
                {...dottedProps}
              />
            </g>
          );
        }
      })}

      {/* 5. Draw the commit node circle */}
      <circle
        cx={nodeX}
        cy={nodeY}
        r={nodeRadius}
        fill={isUncommitted ? 'transparent' : hasMerge ? 'transparent' : color}
        stroke={isUncommitted ? uncommittedColor : color}
        strokeWidth={2}
        {...(isUncommitted ? { strokeDasharray: '3 2' } : {})}
        className={onNodeMouseEnter ? 'cursor-pointer' : undefined}
        onMouseEnter={onNodeMouseEnter ? (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onNodeMouseEnter(commit.hash, rect);
        } : undefined}
        onMouseLeave={onNodeMouseLeave}
      />
    </svg>
  );
});
