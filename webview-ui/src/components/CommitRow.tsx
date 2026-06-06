import { memo, useMemo } from 'react';
import type { Commit, UserSettings, WorktreeInfo } from '@shared/types';
import type { GraphTopology } from '../utils/graphTopology';
import { useGraphStore } from '../stores/graphStore';
import { GraphCell } from './GraphCell';
import { CommitContextMenu } from './CommitContextMenu';
import { BranchContextMenu } from './BranchContextMenu';
import { StashContextMenu } from './StashContextMenu';
import { UncommittedContextMenu } from './UncommittedContextMenu';
import { OverflowRefsBadge } from './OverflowRefsBadge';
import { RefLabel } from './RefLabel';
import { HeadIcon } from './icons';
import { renderInlineCode } from '../utils/inlineCodeRenderer';
import { mergeRefs, displayRefToRefInfo, displayRefKey } from '../utils/mergeRefs';
import { getDateFormatter } from '../utils/formatDate';
import { AuthorAvatar } from './AuthorAvatar';
import { getColor, getLaneColorStyle, resolvePalette } from '../utils/colorUtils';
import { slotMatchesCommitRow } from '../utils/compareMarker';
import { DetachedWorktreeBadge } from './DetachedWorktreeBadge';
import { prioritizeWorktreeDisplayRefs, worktreeForDisplayRef } from '../utils/worktreeDisplay';

const EMPTY_WORKTREES: WorktreeInfo[] = [];

/** Compare-refs A/B markers (042-compare-refs FR-026/027/028). Marker appears
 *  immediately on slot fill for deterministic kinds (commit/branch/tag/head);
 *  `aResolvedHash` / `bResolvedHash` provide the fallback for `expression` slots
 *  after a compare runs. Working Tree / empty-tree never get a marker. */
function CompareABMarker({ commit, isUncommitted }: { commit: Commit; isUncommitted: boolean }) {
  const a = useGraphStore((s) => s.compareSelection.a);
  const b = useGraphStore((s) => s.compareSelection.b);
  const aHash = useGraphStore((s) => s.compareSelection.aResolvedHash);
  const bHash = useGraphStore((s) => s.compareSelection.bResolvedHash);
  if (isUncommitted) return null;
  const isA = slotMatchesCommitRow(a, commit) || (aHash !== null && aHash === commit.hash);
  const isB = slotMatchesCommitRow(b, commit) || (bHash !== null && bHash === commit.hash);
  if (!isA && !isB) return null;
  return (
    <span className="flex flex-shrink-0 items-center gap-0.5">
      {isA && (
        <span
          className="rounded bg-sky-500 px-1 py-0 text-[10px] font-bold text-white"
          title="Compare: Base"
        >
          B
        </span>
      )}
      {isB && (
        <span
          className="rounded bg-emerald-500 px-1 py-0 text-[10px] font-bold text-white"
          title="Compare: Target"
        >
          T
        </span>
      )}
    </span>
  );
}

interface CommitRowProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  graphWidth: number;
  rowHeight: number;
  maxVisibleRefs?: number;
  userSettings: UserSettings;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isSearchMatch?: boolean;
  isCurrentSearchMatch?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onNodeMouseEnter?: (hash: string, rect: DOMRect) => void;
  onNodeMouseLeave?: () => void;
  style: React.CSSProperties;
}

export const CommitRow = memo(function CommitRow({
  commit,
  commits,
  index,
  topology,
  graphWidth,
  rowHeight,
  maxVisibleRefs = 3,
  userSettings,
  isSelected,
  isMultiSelected = false,
  isSearchMatch = false,
  isCurrentSearchMatch = false,
  onClick,
  onNodeMouseEnter,
  onNodeMouseLeave,
  style,
}: CommitRowProps) {
  const { avatarsEnabled, dateFormat, dateFormatCustom, showRemoteBranches, showTags, graphColors } = userSettings;
  const dateFormatter = getDateFormatter(dateFormat, dateFormatCustom);
  const isStash = commit.refs.some((r) => r.type === 'stash');
  const isUncommitted = commit.refs.some((r) => r.type === 'uncommitted');
  const stashIndex = isStash ? parseStashIndex(commit.refs) : -1;
  const worktreeByBranch = useGraphStore((s) => s.worktreeByBranch);
  const detachedWorktrees = useGraphStore((s) => s.detachedWorktreesByHead.get(commit.hash) ?? EMPTY_WORKTREES);

  const node = topology.nodes.get(commit.hash);
  const palette = resolvePalette(graphColors);
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

  const prioritizedDisplayRefs = useMemo(
    () => prioritizeWorktreeDisplayRefs(displayRefs, worktreeByBranch),
    [displayRefs, worktreeByBranch],
  );
  const visibleRefs = prioritizedDisplayRefs.slice(0, maxVisibleRefs);
  const overflowRefs = prioritizedDisplayRefs.slice(maxVisibleRefs);
  const showDetachedWorktrees = !isStash && !isUncommitted && detachedWorktrees.length > 0;

  const row = (
    <div
      className={`flex items-center gap-2 px-2 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] ${bgClass}`}
      style={style}
      onClick={onClick}
    >
      <GraphCell
        commit={commit}
        commits={commits}
        index={index}
        topology={topology}
        width={graphWidth}
        height={rowHeight}
        graphColors={graphColors}
        isHeadCommit={isHead}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
      />

      <span
        className="w-16 flex-shrink-0 font-mono text-xs text-[var(--vscode-textLink-foreground)]"
        title={commit.hash}
      >
        {commit.abbreviatedHash}
      </span>

      <CompareABMarker commit={commit} isUncommitted={isUncommitted} />

      {(isHead || prioritizedDisplayRefs.length > 0 || showDetachedWorktrees) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {isHead && (
            <HeadIcon
              className={`flex-shrink-0${!laneColor ? ' text-[var(--vscode-badge-foreground)]' : ''}`}
              style={laneColor ? { color: laneColor } : undefined}
            />
          )}
          {visibleRefs.map((displayRef) =>
            displayRef.type === 'stash' ? (
              <StashContextMenu key={displayRefKey(displayRef)} commit={commit} stashIndex={stashIndex}>
                <RefLabel displayRef={displayRef} laneColorStyle={laneColorStyle} />
              </StashContextMenu>
            ) : (
              <BranchContextMenu key={displayRefKey(displayRef)} refInfo={displayRefToRefInfo(displayRef)}>
                <RefLabel
                  displayRef={displayRef}
                  laneColorStyle={laneColorStyle}
                  worktree={worktreeForDisplayRef(displayRef, worktreeByBranch)}
                />
              </BranchContextMenu>
            )
          )}
          <OverflowRefsBadge hiddenRefs={overflowRefs} laneColorStyle={laneColorStyle} worktreeByBranch={worktreeByBranch} />
          {showDetachedWorktrees && <DetachedWorktreeBadge worktrees={detachedWorktrees} laneColorStyle={laneColorStyle} />}
        </div>
      )}

      <span
        className={`flex-1 truncate text-sm ${isStash ? 'italic text-[var(--vscode-descriptionForeground)]' : isUncommitted ? 'italic text-[#E8A317]' : ''}`}
        title={commit.subject}
      >
        {renderInlineCode(commit.subject)}
      </span>

      <div className="flex w-36 flex-shrink-0 items-center gap-2 overflow-hidden">
        {avatarsEnabled && commit.author ? (
          <AuthorAvatar author={commit.author} email={commit.authorEmail} />
        ) : null}

        <span className="truncate text-xs text-[var(--vscode-descriptionForeground)]" title={commit.author}>
          {commit.author}
        </span>
      </div>

      <span className="min-w-[8rem] flex-shrink-0 whitespace-nowrap text-xs text-[var(--vscode-descriptionForeground)] text-right">
        {dateFormatter(commit.authorDate)}
      </span>
    </div>
  );

  if (isUncommitted) {
    return (
      <UncommittedContextMenu>
        {row}
      </UncommittedContextMenu>
    );
  }

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

function parseStashIndex(refs: Commit['refs']): number {
  for (const ref of refs) {
    if (ref.type === 'stash') {
      const match = ref.name.match(/\{(\d+)\}/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return -1;
}
