import { memo, useMemo } from 'react';
import type { Commit } from '@shared/types';
import type { GraphTopology } from '../utils/graphTopology';
import { GraphCell } from './GraphCell';
import { CommitContextMenu } from './CommitContextMenu';
import { BranchContextMenu } from './BranchContextMenu';
import { StashContextMenu } from './StashContextMenu';
import { OverflowRefsBadge } from './OverflowRefsBadge';
import { RefLabel } from './RefLabel';
import { HeadIcon } from './icons';
import { mergeRefs, displayRefToRefInfo, displayRefKey } from '../utils/mergeRefs';
import { formatAbsoluteDateTime, formatRelativeDate } from '../utils/formatDate';
import { AuthorAvatar } from './AuthorAvatar';
import { useGraphStore } from '../stores/graphStore';

interface CommitRowProps {
  commit: Commit;
  commits: Commit[];
  index: number;
  topology: GraphTopology;
  graphWidth: number;
  rowHeight: number;
  maxVisibleRefs?: number;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isSearchMatch?: boolean;
  isCurrentSearchMatch?: boolean;
  onClick: (e: React.MouseEvent) => void;
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
  isSelected,
  isMultiSelected = false,
  isSearchMatch = false,
  isCurrentSearchMatch = false,
  onClick,
  style,
}: CommitRowProps) {
  const { avatarsEnabled, dateFormat, showRemoteBranches, showTags } = useGraphStore((state) => state.userSettings);
  const isStash = commit.refs.some((r) => r.type === 'stash');
  const stashIndex = isStash ? parseStashIndex(commit.refs) : -1;

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

  const visibleRefs = displayRefs.slice(0, maxVisibleRefs);
  const overflowRefs = displayRefs.slice(maxVisibleRefs);

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
        isHeadCommit={isHead}
      />

      <span
        className="w-16 flex-shrink-0 font-mono text-xs text-[var(--vscode-textLink-foreground)]"
        title={commit.hash}
      >
        {commit.abbreviatedHash}
      </span>

      {(isHead || displayRefs.length > 0) && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {isHead && (
            <HeadIcon className="text-[var(--vscode-badge-foreground)] flex-shrink-0" />
          )}
          {visibleRefs.map((displayRef) =>
            displayRef.type === 'stash' ? (
              <StashContextMenu key={displayRefKey(displayRef)} commit={commit} stashIndex={stashIndex}>
                <RefLabel displayRef={displayRef} />
              </StashContextMenu>
            ) : (
              <BranchContextMenu key={displayRefKey(displayRef)} refInfo={displayRefToRefInfo(displayRef)}>
                <RefLabel displayRef={displayRef} />
              </BranchContextMenu>
            )
          )}
          <OverflowRefsBadge hiddenRefs={overflowRefs} />
        </div>
      )}

      <span
        className={`flex-1 truncate text-sm ${isStash ? 'italic text-[var(--vscode-descriptionForeground)]' : ''}`}
        title={commit.subject}
      >
        {commit.subject}
      </span>

      <div className="flex w-36 flex-shrink-0 items-center gap-2 overflow-hidden">
        {avatarsEnabled && commit.author ? (
          <AuthorAvatar author={commit.author} email={commit.authorEmail} />
        ) : null}

        <span className="truncate text-xs text-[var(--vscode-descriptionForeground)]" title={commit.author}>
          {commit.author}
        </span>
      </div>

      <span className="w-24 flex-shrink-0 text-xs text-[var(--vscode-descriptionForeground)] text-right">
        {dateFormat === 'absolute'
          ? formatAbsoluteDateTime(commit.authorDate)
          : formatRelativeDate(commit.authorDate)}
      </span>
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

function parseStashIndex(refs: Commit['refs']): number {
  for (const ref of refs) {
    if (ref.type === 'stash') {
      const match = ref.name.match(/\{(\d+)\}/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return 0;
}
