import { memo, useMemo } from 'react';
import type { Commit, CommitTableColumnId, UserSettings } from '@shared/types';
import type { GraphTopology } from '../utils/graphTopology';
import { GraphCell } from './GraphCell';
import { CommitContextMenu } from './CommitContextMenu';
import { BranchContextMenu } from './BranchContextMenu';
import { StashContextMenu } from './StashContextMenu';
import { OverflowRefsBadge } from './OverflowRefsBadge';
import { RefLabel } from './RefLabel';
import { HeadIcon } from './icons';
import { renderInlineCode } from '../utils/inlineCodeRenderer';
import { mergeRefs, displayRefToRefInfo, displayRefKey } from '../utils/mergeRefs';
import { formatAbsoluteDateTime, formatRelativeDate } from '../utils/formatDate';
import { AuthorAvatar } from './AuthorAvatar';
import { getColor, getLaneColorStyle, DEFAULT_GRAPH_PALETTE } from '../utils/colorUtils';
import type { ResolvedCommitTableLayout } from '../utils/commitTableLayout';

interface CommitTableRowProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  rowHeight: number;
  layout: ResolvedCommitTableLayout;
  maxVisibleRefs: number;
  userSettings: UserSettings;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isSearchMatch?: boolean;
  isCurrentSearchMatch?: boolean;
  onClick: (event: React.MouseEvent) => void;
  onNodeMouseEnter?: (hash: string, rect: DOMRect) => void;
  onNodeMouseLeave?: () => void;
  style: React.CSSProperties;
}

export const CommitTableRow = memo(function CommitTableRow({
  commit,
  commits,
  index,
  topology,
  rowHeight,
  layout,
  maxVisibleRefs,
  userSettings,
  isSelected,
  isMultiSelected = false,
  isSearchMatch = false,
  isCurrentSearchMatch = false,
  onClick,
  onNodeMouseEnter,
  onNodeMouseLeave,
  style,
}: CommitTableRowProps) {
  const { avatarsEnabled, dateFormat, showRemoteBranches, showTags, graphColors } = userSettings;
  const isStash = commit.refs.some((ref) => ref.type === 'stash');
  const stashIndex = isStash ? parseStashIndex(commit.refs) : -1;
  const graphColumn = layout.columns.find((column) => column.id === 'graph');

  const node = topology.nodes.get(commit.hash);
  const palette = graphColors.length > 0 ? graphColors : DEFAULT_GRAPH_PALETTE;
  const laneColor = node ? getColor(node.colorIndex, palette) : undefined;
  const laneColorStyle = laneColor ? getLaneColorStyle(laneColor) : undefined;

  const { isHead, displayRefs } = useMemo(() => {
    const mergedRefs = mergeRefs(commit.refs);
    return {
      ...mergedRefs,
      displayRefs: mergedRefs.displayRefs.flatMap((displayRef) => {
        if (!showRemoteBranches && displayRef.type === 'remote-branch') {
          return [];
        }
        if (!showRemoteBranches && displayRef.type === 'merged-branch') {
          return [{ type: 'local-branch', localName: displayRef.localName } as const];
        }
        if (!showTags && displayRef.type === 'tag') {
          return [];
        }
        return [displayRef];
      }),
    };
  }, [commit.refs, showRemoteBranches, showTags]);

  const visibleRefs = displayRefs.slice(0, maxVisibleRefs);
  const overflowRefs = displayRefs.slice(maxVisibleRefs);

  const bgClass = isSelected
    ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
    : isMultiSelected
      ? 'bg-[var(--vscode-list-inactiveSelectionBackground)]'
      : isCurrentSearchMatch
        ? 'bg-[var(--vscode-editor-findMatchHighlightBackground)]'
        : isSearchMatch
          ? 'bg-[var(--vscode-editor-findMatchBackground)]'
          : index % 2 === 0
            ? 'bg-transparent'
            : 'bg-[var(--vscode-list-hoverBackground)]/30';

  const row = (
    <div
      className={`grid cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] ${bgClass}`}
      style={{
        ...style,
        gridTemplateColumns: layout.gridTemplateColumns,
        width: layout.tableWidth,
      }}
      onClick={onClick}
    >
      {layout.columns.map((column, columnIndex) => (
        <div
          key={column.id}
          className={`min-w-0 overflow-hidden px-2 ${columnIndex < layout.columns.length - 1 ? 'border-r border-[var(--vscode-panel-border)]' : ''}`}
        >
          {renderColumn({
            columnId: column.id,
            commit,
            commits,
            index,
            topology,
            rowHeight,
            graphWidth: graphColumn?.effectiveWidth ?? 0,
            isHead,
            visibleRefs,
            overflowRefs,
            avatarsEnabled,
            dateFormat,
            laneColor,
            laneColorStyle,
            isStash,
            stashIndex,
            onNodeMouseEnter,
            onNodeMouseLeave,
          })}
        </div>
      ))}
    </div>
  );

  if (isStash) {
    return (
      <StashContextMenu commit={commit} stashIndex={stashIndex}>
        {row}
      </StashContextMenu>
    );
  }

  return (
    <CommitContextMenu commit={commit}>
      {row}
    </CommitContextMenu>
  );
});

function renderColumn({
  columnId,
  commit,
  commits,
  index,
  topology,
  rowHeight,
  graphWidth,
  isHead,
  visibleRefs,
  overflowRefs,
  avatarsEnabled,
  dateFormat,
  laneColor,
  laneColorStyle,
  isStash,
  stashIndex,
  onNodeMouseEnter,
  onNodeMouseLeave,
}: {
  columnId: CommitTableColumnId;
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  rowHeight: number;
  graphWidth: number;
  isHead: boolean;
  visibleRefs: ReturnType<typeof mergeRefs>['displayRefs'];
  overflowRefs: ReturnType<typeof mergeRefs>['displayRefs'];
  avatarsEnabled: boolean;
  dateFormat: UserSettings['dateFormat'];
  laneColor: string | undefined;
  laneColorStyle: React.CSSProperties | undefined;
  isStash: boolean;
  stashIndex: number;
  onNodeMouseEnter?: (hash: string, rect: DOMRect) => void;
  onNodeMouseLeave?: () => void;
}) {
  switch (columnId) {
    case 'graph':
      return (
        <div className="flex h-full items-center">
          <GraphCell
            commit={commit}
            commits={commits}
            index={index}
            topology={topology}
            width={graphWidth}
            height={rowHeight}
            isHeadCommit={isHead}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
          />
        </div>
      );
    case 'hash':
      return (
        <div className="flex h-full items-center">
          <span
            className="truncate font-mono text-xs text-[var(--vscode-textLink-foreground)]"
            title={commit.hash}
          >
            {commit.abbreviatedHash}
          </span>
        </div>
      );
    case 'message':
      return (
        <div className="flex h-full items-center gap-1 overflow-hidden">
          {(isHead || visibleRefs.length > 0) && (
            <div className="flex shrink-0 items-center gap-1">
              {isHead && (
                <HeadIcon
                  className={`shrink-0${!laneColor ? ' text-[var(--vscode-badge-foreground)]' : ''}`}
                  style={laneColor ? { color: laneColor } : undefined}
                />
              )}
              {visibleRefs.map((displayRef) =>
                displayRef.type === 'stash' ? (
                  <StashContextMenu key={displayRefKey(displayRef)} commit={commit} stashIndex={stashIndex}>
                    <RefLabel displayRef={displayRef} laneColorStyle={laneColorStyle} className="whitespace-nowrap" />
                  </StashContextMenu>
                ) : (
                  <BranchContextMenu key={displayRefKey(displayRef)} refInfo={displayRefToRefInfo(displayRef)}>
                    <RefLabel displayRef={displayRef} laneColorStyle={laneColorStyle} className="whitespace-nowrap" />
                  </BranchContextMenu>
                )
              )}
              <OverflowRefsBadge hiddenRefs={overflowRefs} laneColorStyle={laneColorStyle} />
            </div>
          )}
          <span
            className={`truncate text-sm ${isStash ? 'italic text-[var(--vscode-descriptionForeground)]' : ''}`}
            title={commit.subject}
          >
            {renderInlineCode(commit.subject)}
          </span>
        </div>
      );
    case 'author':
      return (
        <div className="flex h-full items-center gap-2 overflow-hidden">
          {avatarsEnabled && commit.author ? (
            <AuthorAvatar author={commit.author} email={commit.authorEmail} />
          ) : null}
          <span className="truncate text-xs text-[var(--vscode-descriptionForeground)]" title={commit.author}>
            {commit.author}
          </span>
        </div>
      );
    case 'date':
      return (
        <div className="flex h-full items-center justify-end">
          <span className="truncate text-right text-xs text-[var(--vscode-descriptionForeground)]">
            {dateFormat === 'absolute'
              ? formatAbsoluteDateTime(commit.authorDate)
              : formatRelativeDate(commit.authorDate)}
          </span>
        </div>
      );
    default:
      return null;
  }
}

function parseStashIndex(refs: Commit['refs']): number {
  for (const ref of refs) {
    if (ref.type === 'stash') {
      const match = ref.name.match(/\{(\d+)\}/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }
  return -1;
}
